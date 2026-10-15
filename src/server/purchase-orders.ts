import { auditTransaction, type AuditActor } from "@/server/audit";
import { getPrisma } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { purchaseFilterSchema, purchaseInputSchema, deliveryInputSchema, deliveryStatus, type PurchaseFilter, type PurchasePage } from "@/features/purchase-orders/schema";

type Row = Prisma.PurchaseOrderGetPayload<{ include: { deliveries: true } }>;
function serialize(row: Row, today = shanghaiToday()) {
  const due = row.deliveries.filter((d) => d.deliveryDate.toISOString().slice(0, 10) <= today);
  const deliverySum = due.reduce((sum, d) => sum.add(d.quantity), new Prisma.Decimal(0)).toNumber();
  const last = due.map((d) => d.deliveryDate.toISOString().slice(0, 10)).sort().at(-1);
  return { id: row.id, updatedAt: row.updatedAt.toISOString(), orderDate: row.orderDate.toISOString().slice(0, 10), supplier: row.supplier || "", itemCode: row.itemCode, category: row.category,
    quantity: Number(row.quantity), unitPrice: Number(row.unitPrice), amount: Number(row.amount), taxIncluded: row.taxIncluded,
    remittanceInCompany: row.remittanceInCompany || "", remittanceOutCompany: row.remittanceOutCompany || "", remittanceDate: row.remittanceDate?.toISOString().slice(0, 10) || "",
    deliveryInfo: row.deliveryInfo || "", arrivalDate: last && deliverySum >= Number(row.quantity) - .001 ? last : row.arrivalDate?.toISOString().slice(0, 10) || "",
    status: row.status === "finished" ? "finished" as const : "unfinished" as const, remark: row.remark || "", deliverySum,
    effectiveStatus: deliveryStatus(Number(row.quantity), deliverySum, row.status),
    deliveries: row.deliveries.map((d) => ({ id: d.id, deliveryDate: d.deliveryDate.toISOString().slice(0, 10), quantity: Number(d.quantity), synced: d.synced })),
  };
}
async function lockPurchases(tx: Prisma.TransactionClient) {
  // All purchase writers share this lock, including read-triggered arrivals.
  // Stock uses the same material lock as outbound FIFO deductions.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(73814, 1)::text`;
}
async function lockStock(tx: Prisma.TransactionClient, code: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(73812, hashtext(${code.trim().toLowerCase()}))::text`;
}
async function inbound(tx: Prisma.TransactionClient, row: { itemCode: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; taxIncluded: boolean }, sourceType: string, sourceId: number) {
  await lockStock(tx, row.itemCode);
  const material = await tx.material.findFirst({ where: { code: { equals: row.itemCode, mode: "insensitive" } } });
  const packs = Math.round(Number(row.quantity) * (material?.packsPerTon || 40));
  if (packs <= 0) return;
  const name = material?.name || row.itemCode;
  if (!material) await tx.material.create({ data: { code: row.itemCode, name } });
  await tx.inboundRecord.create({ data: { code: row.itemCode, name, packCount: packs, inboundUnitPrice: row.unitPrice, taxIncluded: row.taxIncluded, sourceType, sourceId } });
}
async function rollbackInbound(tx: Prisma.TransactionClient, code: string, sourceType: string, sourceId: number) {
  await lockStock(tx, code);
  await tx.inboundRecord.deleteMany({ where: { sourceType, sourceId } });
}
async function syncDue(tx: Prisma.TransactionClient, today: string) {
  const rows = await tx.purchaseOrder.findMany({ where: { OR: [
    { deliveries: { some: { synced: false, deliveryDate: { lte: new Date(today) } } } },
    { status: "unfinished", arrivalDate: { lte: new Date(today) }, deliveries: { none: {} } },
  ] }, include: { deliveries: { orderBy: [{ deliveryDate: "asc" }, { id: "asc" }] } }, orderBy: { id: "asc" } });
  for (const code of [...new Set(rows.map((r) => r.itemCode.trim().toLowerCase()))].sort()) await lockStock(tx, code);
  for (const row of rows) {
    if (!row.deliveries.length) {
      await inbound(tx, row, "purchase_order", row.id);
      await tx.purchaseOrder.update({ where: { id: row.id }, data: { status: "finished" } });
    } else {
      for (const d of row.deliveries) if (!d.synced && d.deliveryDate.toISOString().slice(0, 10) <= today) {
        await inbound(tx, { ...row, quantity: d.quantity }, "purchase_delivery", d.id);
        await tx.purchaseOrderDelivery.update({ where: { id: d.id }, data: { synced: true } });
      }
      await updateDeliveryState(tx, row.id, today);
    }
  }
}
async function updateDeliveryState(tx: Prisma.TransactionClient, id: number, today: string) {
  const row = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { deliveries: true } });
  const due = row.deliveries.filter((d) => d.deliveryDate.toISOString().slice(0, 10) <= today);
  const sum = due.reduce((total, d) => total.add(d.quantity), new Prisma.Decimal(0));
  const full = due.length > 0 && sum.gte(row.quantity.sub(.001));
  const last = due.map((d) => d.deliveryDate).sort((a, b) => b.getTime() - a.getTime())[0];
  await tx.purchaseOrder.update({ where: { id }, data: { status: full ? "finished" : "unfinished", arrivalDate: full ? last : null } });
}
export async function readPurchaseOrders(input: PurchaseFilter, all = false): Promise<PurchasePage> {
  const filter = purchaseFilterSchema.parse(input); const today = shanghaiToday(); const db = getPrisma();
  await db.$transaction(async (tx) => { await lockPurchases(tx); await syncDue(tx, today); }, { timeout: 30000 });
  const clauses: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filter.date) clauses.push(Prisma.sql`po.order_date = ${new Date(filter.date)}::date`);
  if (filter.arrivalDate) clauses.push(Prisma.sql`po.arrival_date = ${new Date(filter.arrivalDate)}::date`);
  if (filter.supplier) clauses.push(Prisma.sql`position(lower(${filter.supplier}) in lower(coalesce(po.supplier, ''))) > 0`);
  if (filter.itemCode) clauses.push(Prisma.sql`position(lower(${filter.itemCode}) in lower(po.item_code)) > 0`);
  if (filter.category) clauses.push(Prisma.sql`po.category = ${filter.category}`);
  if (filter.status) clauses.push(Prisma.sql`(CASE WHEN coalesce(dt.total, 0) > 0 THEN CASE WHEN dt.total >= po.quantity THEN 'finished' ELSE 'unfinished' END ELSE po.status END) = ${filter.status}`);
  const from = Prisma.sql`FROM purchase_orders po LEFT JOIN (SELECT order_id, SUM(quantity) AS total FROM purchase_order_deliveries WHERE delivery_date <= ${new Date(today)}::date GROUP BY order_id) dt ON dt.order_id = po.id WHERE ${Prisma.join(clauses, " AND ")}`;
  return db.$transaction(async (tx) => {
    const [count] = await tx.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total ${from}`;
    const total = Number(count.total); const page = Math.min(filter.page, Math.max(1, Math.ceil(total / filter.pageSize)));
    const ids = await tx.$queryRaw<{ id: number }[]>`SELECT po.id ${from} ORDER BY po.order_date DESC, po.id DESC ${all ? Prisma.empty : Prisma.sql`LIMIT ${filter.pageSize} OFFSET ${(page - 1) * filter.pageSize}`}`;
    const rows = await tx.purchaseOrder.findMany({ where: { id: { in: ids.map((r) => r.id) } }, orderBy: [{ orderDate: "desc" }, { id: "desc" }], include: { deliveries: { orderBy: [{ deliveryDate: "asc" }, { id: "asc" }] } } });
    return { data: rows.map((r) => serialize(r, today)), total, page, pageSize: filter.pageSize };
  }, { isolationLevel: "RepeatableRead" });
}
export async function persistPurchaseOrder(input: unknown, actor?: AuditActor) {
  const parsed = purchaseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message || "请检查订货内容" };
  const { id, updatedAt, ...fields } = parsed.data;
  return auditTransaction(actor, async (tx) => {
    await lockPurchases(tx);
    const current = id ? await tx.purchaseOrder.findUnique({ where: { id }, include: { deliveries: true } }) : null;
    if (id && (!current || current.updatedAt.toISOString() !== updatedAt)) return { ok: false as const, message: "记录已发生变化，请刷新后重试" };
    if (current?.deliveries.length && current.deliveries.reduce((s, d) => s.add(d.quantity), new Prisma.Decimal(0)).gt(fields.quantity)) return { ok: false as const, message: "订货数量不能小于已登记分批总量" };
    if (current?.deliveries.some((d) => d.synced) && current.itemCode !== fields.itemCode) return { ok: false as const, message: "已有分批入库，不能修改货号" };
    const status = fields.arrivalDate && fields.arrivalDate <= shanghaiToday() ? "finished" : fields.status;
    const data = { ...fields, orderDate: new Date(fields.orderDate), arrivalDate: fields.arrivalDate ? new Date(fields.arrivalDate) : null, status,
      remittanceInCompany: fields.taxIncluded ? fields.remittanceInCompany || null : null, remittanceOutCompany: fields.taxIncluded ? fields.remittanceOutCompany || null : null,
      remittanceDate: fields.taxIncluded && fields.remittanceDate ? new Date(fields.remittanceDate) : null, amount: new Prisma.Decimal(fields.quantity).mul(fields.unitPrice).toDecimalPlaces(2) };
    const row = id ? await tx.purchaseOrder.update({ where: { id }, data }) : await tx.purchaseOrder.create({ data });
    if (!current?.deliveries.length) {
      if (status === "finished" && current?.status !== "finished") await inbound(tx, row, "purchase_order", row.id);
      if (status === "unfinished" && current?.status === "finished") await rollbackInbound(tx, current.itemCode, "purchase_order", row.id);
    }
    return { ok: true as const, id: row.id };
  });
}
export async function addPurchaseDelivery(input: unknown, actor?: AuditActor) {
  const parsed = deliveryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "请填写有效的到货日期和数量" };
  const { orderId, updatedAt, deliveryDate, quantity } = parsed.data;
  return auditTransaction(actor, async (tx) => {
    await lockPurchases(tx);
    const row = await tx.purchaseOrder.findUnique({ where: { id: orderId }, include: { deliveries: true } });
    if (!row) return { ok: false as const, message: "订货记录不存在" };
    if (updatedAt && row.updatedAt.toISOString() !== updatedAt) return { ok: false as const, message: "记录已发生变化，请关闭编辑并刷新后重试" };
    const total = row.deliveries.reduce((s, d) => s.add(d.quantity), new Prisma.Decimal(0));
    if (total.add(quantity).gt(row.quantity)) return { ok: false as const, message: `已录${total}吨，本次${quantity}吨，超过订货总量${row.quantity}吨` };
    // Converting a whole-order receipt to batches removes that receipt first.
    // Otherwise recording the same goods as batches would double stock.
    if (!row.deliveries.length && row.status === "finished") await rollbackInbound(tx, row.itemCode, "purchase_order", row.id);
    const synced = deliveryDate <= shanghaiToday();
    const delivery = await tx.purchaseOrderDelivery.create({ data: { orderId, deliveryDate: new Date(deliveryDate), quantity, synced } });
    if (synced) await inbound(tx, { ...row, quantity: new Prisma.Decimal(quantity) }, "purchase_delivery", delivery.id);
    await updateDeliveryState(tx, row.id, shanghaiToday());
    const updated = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: row.id }, include: { deliveries: { orderBy: [{ deliveryDate: "asc" }, { id: "asc" }] } } });
    return { ok: true as const, record: serialize(updated), message: synced ? "分批发货已记录并入库" : "分批已记录，到货后自动入库" };
  });
}
export async function removePurchaseDelivery(orderId: number, deliveryId: number, updatedAt?: string, actor?: AuditActor) {
  if (![orderId, deliveryId].every((id) => Number.isSafeInteger(id) && id > 0)) return { ok: false as const, message: "分批记录不存在" };
  return auditTransaction(actor, async (tx) => {
    await lockPurchases(tx);
    const d = await tx.purchaseOrderDelivery.findFirst({ where: { id: deliveryId, orderId }, include: { order: true } });
    if (!d) return { ok: false as const, message: "分批记录已删除" };
    if (updatedAt && d.order.updatedAt.toISOString() !== updatedAt) return { ok: false as const, message: "记录已发生变化，请关闭编辑并刷新后重试" };
    if (d.synced) await rollbackInbound(tx, d.order.itemCode, "purchase_delivery", d.id);
    await tx.purchaseOrderDelivery.delete({ where: { id: d.id } });
    await updateDeliveryState(tx, orderId, shanghaiToday());
    return { ok: true as const, record: serialize(await tx.purchaseOrder.findUniqueOrThrow({ where: { id: orderId }, include: { deliveries: { orderBy: [{ deliveryDate: "asc" }, { id: "asc" }] } } })) };
  });
}
export async function removePurchaseOrder(id: number, updatedAt: string, actor?: AuditActor) {
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isFinite(Date.parse(updatedAt))) return { ok: false as const, message: "订货记录不存在" };
  return auditTransaction(actor, async (tx) => {
    await lockPurchases(tx);
    // Reference deletion removes the order and batches, retaining warehouse
    // receipts. Deleting a single batch above explicitly reverses its receipt.
    const result = await tx.purchaseOrder.deleteMany({ where: { id, updatedAt: new Date(updatedAt) } });
    return result.count ? { ok: true as const } : { ok: false as const, message: "记录已发生变化，请刷新后重试" };
  });
}
