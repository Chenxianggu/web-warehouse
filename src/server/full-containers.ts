import { businessTransaction, type AuditActor } from "@/server/audit";
import { getPrisma } from "@/server/db";

import { Prisma, type FullContainerRecord } from "@/generated/prisma/client";
import { containerFilterSchema, containerInputSchema, clearSupply, type ContainerFilter, type ContainerPage, type ContainerRecord } from "@/features/full-containers/schema";
import { consignmentHistory } from "@/features/outbound/schema";

const auditTransaction = businessTransaction("整柜销售");

function serialize(row: FullContainerRecord): ContainerRecord {
  return { ...row, orderDate: row.orderDate.toISOString().slice(0, 10), quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), amount: Number(row.amount), supplyUnitPrice: Number(row.supplyUnitPrice), supplyAmount: Number(row.supplyAmount), supplyOrderDate: row.supplyOrderDate?.toISOString().slice(0, 10) || "", deliveryDate: row.deliveryDate?.toISOString().slice(0, 10) || "", deliveryInfo: row.deliveryInfo || "", remark: row.remark || "", followStatus: row.followStatus || "", supplyRemark: row.supplyRemark || "", updatedAt: row.updatedAt.toISOString() };
}
export async function readFullContainers(input: ContainerFilter): Promise<ContainerPage> {
  const f = containerFilterSchema.parse(input);
  const where: Prisma.FullContainerRecordWhereInput = {
    ...(f.startDate || f.endDate ? { orderDate: { ...(f.startDate ? { gte: new Date(f.startDate) } : {}), ...(f.endDate ? { lte: new Date(f.endDate) } : {}) } } : {}),
    ...(f.buyer ? { buyer: { contains: f.buyer, mode: "insensitive" } } : {}), ...(f.supplier ? { supplier: { contains: f.supplier, mode: "insensitive" } } : {}), ...(f.itemName ? { itemName: { contains: f.itemName, mode: "insensitive" } } : {}),
  };
  return getPrisma().$transaction(async (tx) => {
    const total = await tx.fullContainerRecord.count({ where }); const page = Math.min(f.page, Math.max(1, Math.ceil(total / f.pageSize)));
    const rows = await tx.fullContainerRecord.findMany({ where, orderBy: [{ orderDate: "desc" }, { id: "desc" }], skip: (page - 1) * f.pageSize, take: f.pageSize });
    return { data: rows.map(serialize), total, page, pageSize: f.pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
async function lockContainer(tx: Prisma.TransactionClient) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(73815, 1)::text`; }
async function lockStock(tx: Prisma.TransactionClient, code: string) { await tx.$queryRaw`SELECT pg_advisory_xact_lock(73812, hashtext(${code.trim().toLowerCase()}))::text`; }
async function lockPair(tx: Prisma.TransactionClient, buyer: string, itemName: string) { const pair = `${buyer.trim().toLowerCase()}:${itemName.trim().toLowerCase()}`; await tx.$queryRaw`SELECT pg_advisory_xact_lock(73813, hashtext(${pair}))::text`; }
async function receive(tx: Prisma.TransactionClient, row: FullContainerRecord) {
  const material = await tx.material.findFirst({ where: { code: { equals: row.itemName, mode: "insensitive" } } });
  const packCount = Math.round(Number(row.quantity) * (material?.packsPerTon || 40));
  if (!row.itemName || packCount <= 0) return;
  if (!material) await tx.material.create({ data: { code: row.itemName, name: row.itemName } });
  await tx.inboundRecord.create({ data: { code: row.itemName, name: material?.name || row.itemName, packCount, sourceType: "full_container", sourceId: row.id } });
}
export async function persistFullContainer(input: unknown, actor?: AuditActor) {
  const parsed = containerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message || "请检查记录内容" };
  const fields = parsed.data.warehouseOnArrival ? clearSupply(parsed.data) : parsed.data;
  const { id, updatedAt, ...values } = fields;
  return auditTransaction(actor, async (tx) => {
    await lockContainer(tx);
    const current = id ? await tx.fullContainerRecord.findUnique({ where: { id } }) : null;
    if (id && (!current || current.updatedAt.toISOString() !== updatedAt)) return { ok: false as const, message: "记录已发生变化，请刷新后重试" };
    for (const code of [...new Set([fields.itemName, current?.itemName || ""].map((s) => s.trim().toLowerCase()))].sort()) await lockStock(tx, code);
    const pairs = [fields, ...(current ? [current] : [])].sort((a, b) => `${a.buyer}:${a.itemName}`.localeCompare(`${b.buyer}:${b.itemName}`));
    for (const row of pairs) await lockPair(tx, row.buyer, row.itemName);
    if (id) await tx.$queryRaw`SELECT id FROM futures WHERE source_full_container_id = ${id} FOR UPDATE`;
    const linked = id ? await tx.customerConsignment.findFirst({ where: { sourceFullContainerId: id } }) : null;
    if (linked && consignmentHistory(linked.outboundHistory).some((d) => d.order_id !== undefined) && (fields.buyer !== linked.customerName || fields.itemName !== linked.itemCode)) return { ok: false as const, message: "寄存记录已有订单出库，修改需方或货物前请先取消相关出库" };
    const data = { ...values, orderDate: new Date(values.orderDate), supplyOrderDate: values.supplyOrderDate ? new Date(values.supplyOrderDate) : null, deliveryDate: values.deliveryDate ? new Date(values.deliveryDate) : null,
      amount: new Prisma.Decimal(values.quantity).mul(values.unitPrice).toDecimalPlaces(2), supplyAmount: new Prisma.Decimal(values.quantity).mul(values.supplyUnitPrice).toDecimalPlaces(2) };
    const saved = id ? await tx.fullContainerRecord.update({ where: { id }, data }) : await tx.fullContainerRecord.create({ data });
    if (saved.warehouseOnArrival) {
      await tx.inboundRecord.deleteMany({ where: { sourceType: "full_container", sourceId: saved.id } });
      const snapshot = { orderDate: saved.orderDate, customerName: saved.buyer, itemCode: saved.itemName, quantity: saved.quantity, unitPrice: saved.unitPrice, amount: saved.amount, remark: saved.remark };
      if (linked) await tx.customerConsignment.update({ where: { id: linked.id }, data: snapshot });
      else await tx.customerConsignment.create({ data: { ...snapshot, sourceFullContainerId: saved.id } });
    } else {
      await tx.customerConsignment.deleteMany({ where: { sourceFullContainerId: saved.id } });
      // Reference regular edits do not add another receipt. Only new records
      // and transitions from consignment to warehouse receipt enter stock.
      if (!current || current.warehouseOnArrival) await receive(tx, saved);
    }
    return { ok: true as const, id: saved.id, message: saved.warehouseOnArrival ? "已保存，已同步到客户寄存" : "已保存" };
  });
}
export async function removeFullContainer(id: number, updatedAt: string, actor?: AuditActor) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(Date.parse(updatedAt))) return { ok: false as const, message: "记录不存在" };
  return auditTransaction(actor, async (tx) => {
    await lockContainer(tx); const row = await tx.fullContainerRecord.findUnique({ where: { id } });
    if (!row || row.updatedAt.toISOString() !== updatedAt) return { ok: false as const, message: "记录已发生变化，请刷新后重试" };
    await lockPair(tx, row.buyer, row.itemName);
    await tx.customerConsignment.deleteMany({ where: { sourceFullContainerId: id } });
    await tx.fullContainerRecord.delete({ where: { id } });
    // As in the reference, deletion retains previously received stock.
    return { ok: true as const };
  });
}
