import { auditTransaction, type AuditActor } from "@/server/audit";
import { getPrisma } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { consignmentHistory } from "@/features/outbound/schema";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { consignmentFilterSchema, consignmentInputSchema, storageFee, type ConsignmentFilter, type ConsignmentPage } from "@/features/consignments/schema";

export async function readConsignments(input: ConsignmentFilter, all = false): Promise<ConsignmentPage> {
  const filter = consignmentFilterSchema.parse(input);
  const db = getPrisma();
  await db.customerConsignment.updateMany({ where: { status: "unfinished", arrivalDate: { lte: new Date(shanghaiToday()) } }, data: { status: "finished" } });
  const where: Prisma.CustomerConsignmentWhereInput = {
    ...(filter.date ? { orderDate: new Date(filter.date) } : {}),
    ...(filter.arrivalDate ? { arrivalDate: new Date(filter.arrivalDate) } : {}),
    ...(filter.customerName ? { customerName: { contains: filter.customerName, mode: "insensitive" } } : {}),
    ...(filter.itemCode ? { itemCode: { contains: filter.itemCode, mode: "insensitive" } } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };
  const result = await db.$transaction(async (tx) => {
    const total = await tx.customerConsignment.count({ where });
    const page = Math.min(filter.page, Math.max(1, Math.ceil(total / filter.pageSize)));
    const rows = await tx.customerConsignment.findMany({ where, orderBy: [{ orderDate: "desc" }, { id: "desc" }], ...(all ? {} : { skip: (page - 1) * filter.pageSize, take: filter.pageSize }) });
    return { rows, total, page };
  }, { isolationLevel: "RepeatableRead" });
  const materials = await db.material.findMany({ where: { code: { in: [...new Set(result.rows.map((row) => row.itemCode))], mode: "insensitive" } }, select: { code: true, packsPerTon: true } });
  const packs = new Map(materials.map((row) => [row.code.toLowerCase(), row.packsPerTon]));
  return { total: result.total, page: result.page, pageSize: filter.pageSize, data: result.rows.map((row) => ({
    id: row.id, updatedAt: row.updatedAt.toISOString(), orderDate: row.orderDate.toISOString().slice(0, 10),
    customerName: row.customerName, itemCode: row.itemCode, quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), amount: Number(row.amount),
    arrivalDate: row.arrivalDate?.toISOString().slice(0, 10) || "", storageFeePrice: Number(row.storageFeePrice), storageFeeDays: row.storageFeeDays,
    storageFeeTotal: Number(row.storageFeeTotal), outboundQuantity: Number(row.outboundQuantity), outboundHistory: consignmentHistory(row.outboundHistory),
    status: row.status === "finished" ? "finished" : "unfinished", remark: row.remark || "", sourceFullContainerId: row.sourceFullContainerId, packsPerTon: packs.get(row.itemCode.toLowerCase()) || 40,
  })) };
}

async function lockPair(tx: Prisma.TransactionClient, customerName: string, itemCode: string) {
  const key = `${customerName.trim().toLowerCase()}:${itemCode.trim().toLowerCase()}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(73813, hashtext(${key}))::text`;
}

export async function persistConsignment(input: unknown, actor?: AuditActor) {
  const parsed = consignmentInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message || "请检查输入内容" };
  const { id, updatedAt, ...fields } = parsed.data;
  return auditTransaction(actor, async (tx) => {
    let legacyOutbound = new Prisma.Decimal(0);
    if (id !== null) {
      const original = await tx.customerConsignment.findUnique({ where: { id } });
      if (!original) return { ok: false as const, message: "寄存记录已删除" };
      // Same pair lock as shipping; the timestamp prevents a stale editor
      // from erasing a deduction made while its dialog was open.
      await lockPair(tx, original.customerName, original.itemCode);
      await tx.$queryRaw`SELECT id FROM futures WHERE id = ${id} FOR UPDATE`;
      const current = await tx.customerConsignment.findUniqueOrThrow({ where: { id } });
      if (current.updatedAt.toISOString() !== updatedAt) return { ok: false as const, message: "记录已发生变化，请关闭编辑并刷新后重试" };
      if (current.sourceFullContainerId && (fields.orderDate !== current.orderDate.toISOString().slice(0, 10) || fields.customerName !== current.customerName || fields.itemCode !== current.itemCode || fields.quantity !== Number(current.quantity) || fields.unitPrice !== Number(current.unitPrice))) return { ok: false as const, message: "整柜货同步的订货信息请在售整柜货中修改" };
      const linked = consignmentHistory(current.outboundHistory).filter((entry) => entry.order_id !== undefined);
      const signature = (entries: typeof linked) => JSON.stringify(entries.map((entry) => [entry.date, entry.quantity, String(entry.order_id)]));
      if (signature(linked) !== signature(fields.outboundHistory.filter((entry) => entry.order_id !== undefined))) return { ok: false as const, message: "订单关联的出库记录请在订单出库中取消或修改" };
      if (!consignmentHistory(current.outboundHistory).length && !fields.outboundHistory.length) legacyOutbound = current.outboundQuantity;
      if (linked.length && (fields.customerName !== current.customerName || fields.itemCode !== current.itemCode || fields.status !== current.status)) return { ok: false as const, message: "存在订单关联出库，不能修改客户、货号或收货状态" };
    } else if (fields.outboundHistory.some((entry) => entry.order_id !== undefined)) return { ok: false as const, message: "新增记录不能指定订单关联" };
    const amount = new Prisma.Decimal(fields.quantity).mul(fields.unitPrice).toDecimalPlaces(2);
    const data = { ...fields, orderDate: new Date(fields.orderDate), arrivalDate: fields.arrivalDate ? new Date(fields.arrivalDate) : null, amount,
      storageFeeTotal: new Prisma.Decimal(storageFee(fields)).toDecimalPlaces(2), outboundQuantity: fields.outboundHistory.reduce((sum, entry) => sum.add(entry.quantity), legacyOutbound),
      status: fields.arrivalDate && fields.arrivalDate <= shanghaiToday() ? "finished" : fields.status };
    const saved = id === null ? await tx.customerConsignment.create({ data }) : await tx.customerConsignment.update({ where: { id }, data });
    return { ok: true as const, id: saved.id };
  });
}

export async function removeConsignment(id: number, updatedAt: string, actor?: AuditActor) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(Date.parse(updatedAt))) return { ok: false as const, message: "寄存记录不存在" };
  return auditTransaction(actor, async (tx) => {
    const row = await tx.customerConsignment.findUnique({ where: { id } });
    if (!row) return { ok: false as const, message: "寄存记录已删除" };
    await lockPair(tx, row.customerName, row.itemCode);
    const result = await tx.customerConsignment.deleteMany({ where: { id, updatedAt: new Date(updatedAt) } });
    return result.count ? { ok: true as const } : { ok: false as const, message: "记录已发生变化，请刷新后重试" };
  });
}
