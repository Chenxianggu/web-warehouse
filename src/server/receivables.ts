import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { buildReceivables, currency, fullContainerCode, type OrderTotal } from "@/features/receivables/ledger";
import { paymentSchema, type PaymentRecord, type ReceivableDetail } from "@/features/receivables/schema";

// Keep sub-cent precision until the customer's total is calculated. Include
// shipped and unshipped orders, and use today's material conversion as before.
const lineAmount = Prisma.sql`(oi.unit_price / COALESCE(NULLIF(m.packs_per_ton, 0), 40)) * oi.pack_count`;

export async function readReceivables() {
  return getPrisma().$transaction(async (tx) => {
    const orders = await tx.$queryRaw<OrderTotal[]>`
      SELECT o.customer_code AS "customerCode", MAX(o.customer_name) AS "customerName",
        COALESCE(SUM(${lineAmount}), 0)::text AS amount
      FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN materials m ON LOWER(TRIM(m.code)) = LOWER(TRIM(oi.code))
      GROUP BY o.customer_code`;
    const customers = await tx.customer.findMany({ orderBy: { id: "asc" }, select: { code: true, fullName: true } });
    const containers = await tx.fullContainerRecord.groupBy({ by: ["buyer"], _sum: { amount: true } });
    const payments = await tx.receivablePayment.groupBy({ by: ["customerCode"], _sum: { amount: true } });
    return {
      rows: buildReceivables(orders, customers, containers.map((row) => ({ buyer: row.buyer, amount: row._sum.amount ?? 0 })),
        payments.map((row) => ({ customerCode: row.customerCode, amount: row._sum.amount ?? 0 }))),
      customers: customers.map((customer) => ({ code: customer.code, name: customer.fullName })),
    };
  }, { isolationLevel: "RepeatableRead" });
}

function serializePayment(payment: Prisma.ReceivablePaymentGetPayload<object>): PaymentRecord {
  return { ...payment, amount: currency(payment.amount), paymentDate: payment.paymentDate.toISOString().slice(0, 10), createdAt: payment.createdAt.toISOString() };
}

export async function readReceivableDetail(customerCode: string): Promise<ReceivableDetail> {
  if (!customerCode.trim() || customerCode.length > 300) throw new Error("客户编号不正确");
  return getPrisma().$transaction(async (tx) => {
    const synthetic = customerCode.startsWith("fc_");
    let customer: { code: string; name: string };
    if (synthetic) {
      const buyers = await tx.fullContainerRecord.findMany({ distinct: ["buyer"], orderBy: { id: "asc" }, select: { buyer: true } });
      const buyer = buyers.find((row) => fullContainerCode(row.buyer.trim()) === customerCode)?.buyer.trim() ?? customerCode.slice(3).replaceAll("_", " ");
      customer = { code: customerCode, name: buyer };
    } else {
      const master = await tx.customer.findUnique({ where: { code: customerCode }, select: { fullName: true } });
      const historical = !master ? await tx.customerOrder.findFirst({ where: { customerCode }, orderBy: { id: "asc" }, select: { customerName: true } }) : null;
      customer = { code: customerCode, name: master?.fullName ?? historical?.customerName ?? "" };
    }
    const ordinary = synthetic ? [] : await tx.$queryRaw<{ id: number; orderNo: string; orderDate: Date; amount: string }[]>`
      SELECT o.id, o.order_no AS "orderNo", o.order_date AS "orderDate", COALESCE(SUM(${lineAmount}), 0)::text AS amount
      FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN materials m ON LOWER(TRIM(m.code)) = LOWER(TRIM(oi.code))
      WHERE o.customer_code = ${customerCode} GROUP BY o.id, o.order_no, o.order_date`;
    const containers = customer.name ? await tx.fullContainerRecord.findMany({ where: { buyer: customer.name }, orderBy: [{ orderDate: "desc" }, { id: "desc" }] }) : [];
    const payments = await tx.receivablePayment.findMany({ where: { customerCode }, orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
    const orders = [
      ...ordinary.map((row) => ({ id: String(row.id), orderNo: row.orderNo, orderDate: row.orderDate.toISOString().slice(0, 10), orderAmount: Number(row.amount) })),
      ...containers.map((row) => ({ id: `fc_${row.id}`, orderNo: `整柜-${row.itemName}`, orderDate: row.orderDate.toISOString().slice(0, 10), orderAmount: Number(row.amount) })),
    ].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.orderNo.localeCompare(a.orderNo));
    const total = ordinary.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).plus(containers.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)));
    const paid = payments.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    return { customer, orders, payments: payments.map(serializePayment), totalAmount: currency(total), paidAmount: currency(paid), receivableAmount: currency(total.minus(paid)) };
  }, { isolationLevel: "RepeatableRead" });
}

export async function persistReceivablePayment(input: unknown) {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "请检查支付记录" };
  const payment = await getPrisma().receivablePayment.create({ data: { ...parsed.data, paymentDate: new Date(`${parsed.data.paymentDate}T00:00:00Z`) } });
  return { ok: true as const, id: payment.id };
}

export async function removeReceivablePayment(id: number) {
  if (!Number.isSafeInteger(id) || id < 1) return { ok: false as const, message: "支付记录不存在" };
  const result = await getPrisma().receivablePayment.deleteMany({ where: { id } });
  return result.count ? { ok: true as const } : { ok: false as const, message: "支付记录不存在" };
}
