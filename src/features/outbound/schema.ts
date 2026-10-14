import { z } from "zod";
import { orderDateSchema, type OrderRecord } from "@/features/customer-orders/schema";

export const outboundFilterSchema = z.object({
  isShipped: z.boolean(),
  date: z.union([z.literal(""), orderDateSchema]),
  customer: z.string().trim().max(255),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(10),
});
export type OutboundFilter = z.infer<typeof outboundFilterSchema>;
export type OutboundPage = { data: OrderRecord[]; total: number; page: number; pageSize: number };
export type ConsignmentHistoryEntry = { date: string; quantity: number; order_id?: number | string };

export function consignmentHistory(raw: unknown): ConsignmentHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is ConsignmentHistoryEntry => typeof entry === "object" && entry !== null && typeof entry.date === "string" && typeof entry.quantity === "number" && Number.isFinite(entry.quantity));
}

// Prefer one sufficient consignment with the smallest remaining balance.
// Otherwise consume oldest first and put any shortfall on the newest row.
export function allocateConsignment(rows: { id: number; quantity: number; outboundQuantity: number }[], tons: number) {
  const epsilon = 1e-9;
  const single = rows.filter((row) => row.quantity - row.outboundQuantity + epsilon >= tons)
    .sort((a, b) => (a.quantity - a.outboundQuantity) - (b.quantity - b.outboundQuantity))[0];
  if (single) return [{ id: single.id, quantity: tons }];
  let remaining = tons;
  const allocations = new Map<number, number>();
  for (const row of rows) {
    const take = Math.min(remaining, Math.max(0, row.quantity - row.outboundQuantity));
    if (take > epsilon) { allocations.set(row.id, take); remaining -= take; }
    if (remaining <= epsilon) break;
  }
  if (remaining > epsilon && rows.length) {
    const newest = rows[rows.length - 1].id;
    allocations.set(newest, (allocations.get(newest) ?? 0) + remaining);
  }
  return Array.from(allocations, ([id, quantity]) => ({ id, quantity }));
}
