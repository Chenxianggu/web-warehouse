import { auditTransaction, type AuditActor } from "@/server/audit";
import { getPrisma } from "@/server/db";
import { serializeCustomerOrders } from "@/server/customer-orders";
import { Prisma } from "@/generated/prisma/client";
import { allocateConsignment, consignmentHistory, outboundFilterSchema, type OutboundFilter, type OutboundPage } from "@/features/outbound/schema";

export async function readOutboundOrders(input: OutboundFilter, all = false): Promise<OutboundPage> {
  const filter = outboundFilterSchema.parse(input);
  const where: Prisma.CustomerOrderWhereInput = {
    isShipped: filter.isShipped,
    ...(filter.date ? { orderDate: new Date(`${filter.date}T00:00:00Z`) } : {}),
    ...(filter.customer ? { OR: [{ customerCode: { contains: filter.customer, mode: "insensitive" } }, { customerName: { contains: filter.customer, mode: "insensitive" } }] } : {}),
  };
  const db = getPrisma();
  // Count and page use one snapshot so shipping in another session cannot
  // leave the current page beyond the last available page.
  const result = await db.$transaction(async (tx) => {
    const total = await tx.customerOrder.count({ where });
    const page = Math.min(filter.page, Math.max(1, Math.ceil(total / filter.pageSize)));
    const orders = await tx.customerOrder.findMany({
      where, orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      ...(all ? {} : { skip: (page - 1) * filter.pageSize, take: filter.pageSize }),
      include: { items: { orderBy: { id: "asc" } } },
    });
    return { orders, total, page };
  }, { isolationLevel: "RepeatableRead" });
  return { data: await serializeCustomerOrders(result.orders), total: result.total, page: result.page, pageSize: filter.pageSize };
}

async function lockStock(tx: Prisma.TransactionClient, codes: string[]) {
  for (const code of [...new Set(codes.map((value) => value.trim().toLowerCase()))].sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73812, hashtext(${code}))::text`;
    await tx.$queryRaw`SELECT id FROM inbound_records WHERE lower(trim(code)) = ${code} ORDER BY id FOR UPDATE`;
  }
}

export async function shipCustomerOrder(id: number, actor?: AuditActor) {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false as const, message: "订单不存在" };
  return auditTransaction(actor, async (tx) => {
    const changed = await tx.customerOrder.updateMany({ where: { id, isShipped: false }, data: { isShipped: true } });
    if (!changed.count) return { ok: false as const, message: "订单不存在或已出库，不能重复出库" };
    const order = await tx.customerOrder.findUniqueOrThrow({ where: { id }, include: { items: { orderBy: { id: "asc" } } } });
    if (!order.items.length) throw new Error("订单明细为空");
    await lockStock(tx, order.items.map((item) => item.code));
    // Multiple lines with the same material must share one FIFO deduction.
    const needs = new Map<string, { code: string; packs: Prisma.Decimal }>();
    for (const item of order.items) {
      const key = item.code.trim().toLowerCase();
      const existing = needs.get(key);
      needs.set(key, { code: item.code, packs: (existing?.packs ?? new Prisma.Decimal(0)).add(item.packCount) });
    }
    const warnings: string[] = [];
    for (const [key, { code, packs }] of needs) {
      const records = await tx.inboundRecord.findMany({ where: { code: { equals: code, mode: "insensitive" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
      const available = records.reduce((sum, row) => sum.add(row.packCount), new Prisma.Decimal(0));
      if (available.lt(packs)) warnings.push(`塑料 ${code} 库存不足，需要 ${packs} 包，但只有 ${available} 包`);
      if (!records.length) {
        const material = await tx.material.findFirst({ where: { code: { equals: code, mode: "insensitive" } } });
        await tx.inboundRecord.create({ data: { code, name: material?.name || code, packCount: packs.negated() } });
      } else {
        let remaining = packs;
        for (const record of records) {
          const take = Prisma.Decimal.min(remaining, Prisma.Decimal.max(0, record.packCount));
          if (take.gt(0)) { await tx.inboundRecord.update({ where: { id: record.id }, data: { packCount: { decrement: take } } }); remaining = remaining.sub(take); }
          if (remaining.lte(0)) break;
        }
        if (remaining.gt(0)) await tx.inboundRecord.update({ where: { id: records[records.length - 1].id }, data: { packCount: { decrement: remaining } } });
      }
      if (!order.deductFutures || !order.customerName.trim()) continue;
      // Also serialize consignment deductions for this customer/material pair.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(73813, hashtext(${`${order.customerName.trim().toLowerCase()}:${key}`}))::text`;
      const rows = await tx.customerConsignment.findMany({
        where: { customerName: { equals: order.customerName.trim(), mode: "insensitive" }, itemCode: { equals: code, mode: "insensitive" }, status: "finished" },
        orderBy: [{ orderDate: "asc" }, { id: "asc" }],
      });
      const material = await tx.material.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { packsPerTon: true } });
      const tons = packs.div(material?.packsPerTon || 40).toNumber();
      for (const allocation of allocateConsignment(rows.map((row) => ({ id: row.id, quantity: Number(row.quantity), outboundQuantity: Number(row.outboundQuantity) })), tons)) {
        const row = rows.find((value) => value.id === allocation.id)!;
        await tx.customerConsignment.update({ where: { id: row.id }, data: {
          outboundQuantity: { increment: allocation.quantity },
          outboundHistory: [...consignmentHistory(row.outboundHistory), { date: order.orderDate.toISOString().slice(0, 10), quantity: allocation.quantity, order_id: id }],
        } });
      }
    }
    return { ok: true as const, warnings };
  }, { timeout: 30000 });
}

export async function unshipCustomerOrder(id: number, actor?: AuditActor) {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false as const, message: "订单不存在" };
  return auditTransaction(actor, async (tx) => {
    const changed = await tx.customerOrder.updateMany({ where: { id, isShipped: true }, data: { isShipped: false } });
    if (!changed.count) return { ok: false as const, message: "订单不存在或未出库，无需取消" };
    const order = await tx.customerOrder.findUniqueOrThrow({ where: { id }, include: { items: true } });
    await lockStock(tx, order.items.map((item) => item.code));
    // The reference system restores stock as fresh, unpriced inbound rows.
    await tx.inboundRecord.createMany({ data: order.items.map((item) => ({ code: item.code, name: item.name || item.code, packCount: item.packCount })) });
    if (order.deductFutures) {
      const codes = [...new Set(order.items.map((item) => item.code))].sort();
      for (const code of codes) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(73813, hashtext(${`${order.customerName.trim().toLowerCase()}:${code.trim().toLowerCase()}`}))::text`;
        const rows = await tx.customerConsignment.findMany({ where: { customerName: { equals: order.customerName.trim(), mode: "insensitive" }, itemCode: { equals: code, mode: "insensitive" }, status: "finished" } });
        for (const row of rows) {
          const history = consignmentHistory(row.outboundHistory);
          const removed = history.filter((entry) => String(entry.order_id) === String(id));
          if (!removed.length) continue;
          const quantity = removed.reduce((sum, entry) => sum.add(entry.quantity), new Prisma.Decimal(0));
          await tx.customerConsignment.update({ where: { id: row.id }, data: {
            outboundQuantity: { decrement: quantity }, outboundHistory: history.filter((entry) => String(entry.order_id) !== String(id)),
          } });
        }
      }
    }
    return { ok: true as const };
  }, { timeout: 30000 });
}
