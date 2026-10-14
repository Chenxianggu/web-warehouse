import { z } from "zod";

export type PricePoint = { orderDate: string; unitPrice: number };
export type PriceTrendQuery = { itemCode: string; year: number };

export function priceTrendYears(today = new Date()) {
  const current = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(today));
  return Array.from({ length: 6 }, (_, index) => current - index);
}

export const priceTrendQuerySchema = z.object({
  itemCode: z.string().trim().min(1, "请选择货号").max(100, "货号最多 100 个字符"),
  year: z.number().int("请选择有效年份").min(1).max(9998),
});

export function preparePricePoints(history: readonly PricePoint[]): PricePoint[] {
  const unique = new Map<string, PricePoint>();
  for (const row of history) {
    const key = `${row.orderDate}|${row.unitPrice}`;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.unitPrice - b.unitPrice);
}

export function priceAxisBounds(points: readonly PricePoint[]) {
  if (!points.length) return { min: 0, max: 8000 };
  let min = Infinity, max = -Infinity;
  for (const point of points) { min = Math.min(min, point.unitPrice); max = Math.max(max, point.unitPrice); }
  const padding = Math.max(200, Math.max(max - min, 100) * 0.2);
  return { min: Math.floor((min - padding) / 50) * 50, max: Math.ceil((max + padding) / 50) * 50 };
}

export const shouldSamplePrices = (count: number) => count > 800;
