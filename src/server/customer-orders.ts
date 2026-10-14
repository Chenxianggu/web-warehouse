import { getPrisma } from "@/server/db";
import { customerOrderSchema, orderDateSchema, type OrderRecord } from "@/features/customer-orders/schema";
import type { Prisma } from "@/generated/prisma/client";

// Server action entry points authorize page access before using these helpers.
export async function readCustomerOrders(date: string, id?: number): Promise<OrderRecord[]> {
  if (date && !orderDateSchema.safeParse(date).success) throw new Error("订单日期格式不正确");
  const db = getPrisma();
  const orders = await db.customerOrder.findMany({
    where: { ...(date ? { orderDate: new Date(`${date}T00:00:00Z`) } : {}), ...(id !== undefined ? { id } : {}) },
    orderBy: [{ orderDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    include: { items: { orderBy: { id: "asc" } } },
  });
  return serializeCustomerOrders(orders);
}

type OrderWithItems = Prisma.CustomerOrderGetPayload<{ include: { items: true } }>;

export async function serializeCustomerOrders(orders: OrderWithItems[]): Promise<OrderRecord[]> {
  const codes = [...new Set(orders.flatMap((order) => order.items.map((item) => item.code)))];
  const db = getPrisma();
  const materials = await db.material.findMany({ where: { code: { in: codes, mode: "insensitive" } }, select: { code: true, packsPerTon: true } });
  const packs = new Map(materials.map((material) => [material.code.trim().toLowerCase(), material.packsPerTon]));
  return orders.map((order) => ({
    ...order,
    orderDate: order.orderDate.toISOString().slice(0, 10),
    createdAt: order.createdAt.toISOString(),
    items: order.items.map((item) => ({
      code: item.code, name: item.name, packCount: Number(item.packCount),
      unitPrice: Number(item.unitPrice), remark: item.remark ?? "", packsPerTon: packs.get(item.code.trim().toLowerCase()) || 40,
    })),
  }));
}

export async function persistCustomerOrder(input: unknown) {
  const parsed = customerOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message || "请检查订单内容" };
  const { id, items, ...fields } = parsed.data;
  const data = { ...fields, orderDate: new Date(`${fields.orderDate}T00:00:00Z`) };
  return getPrisma().$transaction(async (tx) => {
    let orderId: number;
    let orderNo: string;
    if (id !== null) {
      // The conditional write locks the order and rejects shipped orders,
      // including when their state changes after the form was opened.
      const changed = await tx.customerOrder.updateMany({ where: { id, isShipped: false }, data });
      if (!changed.count) return { ok: false as const, message: "订单不存在或已出库，不能修改" };
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id }, select: { orderNo: true } });
      orderId = id;
      orderNo = order.orderNo;
      await tx.customerOrderItem.deleteMany({ where: { orderId } });
    } else {
      const prefix = fields.orderDate.replaceAll("-", "");
      // Serialize number allocation for one date, across processes. Unlike
      // lexicographic sorting this also works above 999 orders per day.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${Number(prefix)}::bigint)::text`;
      const existing = await tx.customerOrder.findMany({ where: { orderNo: { startsWith: prefix } }, select: { orderNo: true } });
      const sequence = existing.reduce((max, order) => Math.max(max, Number(order.orderNo.slice(8)) || 0), 0) + 1;
      orderNo = `${prefix}${String(sequence).padStart(3, "0")}`;
      const order = await tx.customerOrder.create({ data: { ...data, orderNo } });
      orderId = order.id;
    }
    await tx.customerOrderItem.createMany({ data: items.map((item) => ({ ...item, orderId, remark: item.remark || null })) });
    await tx.receiverHistory.upsert({
      where: { customerCode_receiver: { customerCode: fields.customerCode, receiver: fields.receiver } },
      create: { customerCode: fields.customerCode, receiver: fields.receiver }, update: {},
    });
    return { ok: true as const, id: orderId, orderNo };
  });
}

export async function removeCustomerOrder(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false as const, message: "订单不存在" };
  const result = await getPrisma().customerOrder.deleteMany({ where: { id, isShipped: false } });
  return result.count ? { ok: true as const } : { ok: false as const, message: "订单不存在或已出库，不能删除" };
}
