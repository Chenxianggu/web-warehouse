import { Prisma } from "@/generated/prisma/client";
import type { ReceivableRow } from "./schema";

type Amount = string | number | Prisma.Decimal;
export type OrderTotal = { customerCode: string; customerName: string; amount: Amount };
type Customer = { code: string; fullName: string };
type ContainerTotal = { buyer: string; amount: Amount };
type PaymentTotal = { customerCode: string; amount: Amount };

export const fullContainerCode = (buyer: string) => `fc_${buyer.replace(/\s+/g, "_")}`;
export const currency = (value: Amount) => new Prisma.Decimal(value).toDecimalPlaces(2).toNumber();

// Preserve the reference's matching rules: order-name snapshot first, then
// customer full name for container-only buyers, otherwise a synthetic fc_ code.
export function buildReceivables(orders: OrderTotal[], customers: Customer[], containers: ContainerTotal[], payments: PaymentTotal[]): ReceivableRow[] {
  const nameToCode = new Map<string, string>();
  for (const customer of customers) {
    const name = customer.fullName.trim(), code = customer.code.trim();
    if (name && code && !nameToCode.has(name)) nameToCode.set(name, code);
  }
  const paid = new Map(payments.map((payment) => [payment.customerCode, new Prisma.Decimal(payment.amount)]));
  const byBuyer = new Map<string, Prisma.Decimal>();
  for (const container of containers) {
    const buyer = container.buyer.trim();
    if (buyer) byBuyer.set(buyer, (byBuyer.get(buyer) ?? new Prisma.Decimal(0)).plus(container.amount));
  }
  const result: ReceivableRow[] = [];
  function append(code: string, name: string, amount: Prisma.Decimal) {
    if (!amount.gt(0)) return;
    const payment = paid.get(code) ?? new Prisma.Decimal(0);
    result.push({ customerCode: code, customerName: name, totalAmount: currency(amount), paidAmount: currency(payment), receivableAmount: currency(amount.minus(payment)) });
  }
  for (const order of orders) append(order.customerCode, order.customerName, new Prisma.Decimal(order.amount).plus(byBuyer.get(order.customerName) ?? 0));
  const matched = new Set(orders.map((order) => order.customerName));
  for (const [buyer, amount] of byBuyer) {
    if (!matched.has(buyer)) append(nameToCode.get(buyer) ?? fullContainerCode(buyer), buyer, amount);
  }
  return result.sort((a, b) => b.receivableAmount - a.receivableAmount || a.customerName.localeCompare(b.customerName));
}
