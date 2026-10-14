import { getPrisma } from "@/server/db";
import { preparePricePoints, priceTrendQuerySchema, type PricePoint, type PriceTrendQuery } from "@/features/price-trends/schema";

// Callers must authorize /price-trends before reading purchase prices.
export async function readPurchaseItemCodes(): Promise<string[]> {
  const rows = await getPrisma().purchaseOrder.findMany({ distinct: ["itemCode"], orderBy: { itemCode: "asc" }, select: { itemCode: true } });
  return rows.map((row) => row.itemCode).filter((code) => code.trim());
}

export async function readPurchasePriceHistory(input: PriceTrendQuery): Promise<PricePoint[]> {
  const { itemCode, year } = priceTrendQuerySchema.parse(input);
  const start = `${String(year).padStart(4, "0")}-01-01T00:00:00Z`;
  const end = `${String(year + 1).padStart(4, "0")}-01-01T00:00:00Z`;
  const rows = await getPrisma().purchaseOrder.findMany({
    where: { itemCode: { equals: itemCode, mode: "insensitive" }, orderDate: { gte: new Date(start), lt: new Date(end) } },
    select: { orderDate: true, unitPrice: true }, orderBy: [{ orderDate: "asc" }, { unitPrice: "asc" }],
  });
  // No status or tax filter: the reference plots the recorded price as-is.
  return preparePricePoints(rows.map((row) => ({ orderDate: row.orderDate.toISOString().slice(0, 10), unitPrice: Number(row.unitPrice) })));
}
