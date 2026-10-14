import { z } from "zod";
import { orderDateSchema } from "@/features/customer-orders/schema";
import type { ConsignmentHistoryEntry } from "@/features/outbound/schema";

const optionalDate = z.union([z.literal(""), orderDateSchema]);
const nonnegative = (max: number) => z.number().min(0, "数量和价格不能小于零").max(max, "数值超出允许范围");
export const consignmentFilterSchema = z.object({
  date: optionalDate.default(""), arrivalDate: optionalDate.default(""),
  customerName: z.string().trim().max(255).default(""), itemCode: z.string().trim().max(100).default(""),
  status: z.enum(["", "unfinished", "finished"]).default(""),
  page: z.number().int().positive().default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(10),
});
export const consignmentInputSchema = z.object({
  id: z.number().int().positive().nullable(), updatedAt: z.string().datetime().nullable(),
  orderDate: orderDateSchema, customerName: z.string().trim().max(255),
  itemCode: z.string().trim().min(1, "请输入货号").max(100),
  quantity: nonnegative(9999999999), unitPrice: nonnegative(9999999999.99),
  arrivalDate: optionalDate, storageFeePrice: nonnegative(99999999.99),
  storageFeeDays: z.number().int().min(0).max(2147483647),
  status: z.enum(["unfinished", "finished"]), remark: z.string().trim().max(10000),
  outboundHistory: z.array(z.object({ date: orderDateSchema, quantity: nonnegative(9999999999).positive("出库数量必须大于零"), order_id: z.union([z.number().int().positive(), z.string()]).optional() })).max(1000),
}).superRefine((value, ctx) => {
  if (value.id !== null && !value.updatedAt) ctx.addIssue({ code: "custom", message: "请重新打开记录后保存", path: ["updatedAt"] });
  if (value.arrivalDate && value.outboundHistory.some((entry) => entry.date < value.arrivalDate)) ctx.addIssue({ code: "custom", message: "出库日期不能早于到货日期", path: ["outboundHistory"] });
  if (value.quantity * value.unitPrice > 9999999999.99 || storageFee(value) > 9999999999.99) ctx.addIssue({ code: "custom", message: "总金额或仓租总价超出允许范围", path: ["quantity"] });
});
export type ConsignmentFilter = z.infer<typeof consignmentFilterSchema>;
export type ConsignmentInput = z.infer<typeof consignmentInputSchema>;
export type ConsignmentRecord = Omit<ConsignmentInput, "id" | "updatedAt"> & { id: number; updatedAt: string; amount: number; storageFeeTotal: number; outboundQuantity: number; sourceFullContainerId: number | null; packsPerTon: number };
export type ConsignmentPage = { data: ConsignmentRecord[]; total: number; page: number; pageSize: number };
export const emptyFilter: ConsignmentFilter = { date: "", arrivalDate: "", customerName: "", itemCode: "", status: "", page: 1, pageSize: 10 };

export function outboundTotal(row: { outboundHistory: ConsignmentHistoryEntry[]; outboundQuantity: number }) {
  const total = row.outboundHistory.reduce((sum, entry) => sum + entry.quantity, 0);
  return total > 0 ? total : row.outboundQuantity;
}
type FeeInput = { arrivalDate: string; quantity: number; storageFeePrice: number; storageFeeDays: number; outboundHistory: ConsignmentHistoryEntry[] };
export function storageSegments(input: FeeInput) {
  if (!input.arrivalDate || input.quantity <= 0 || input.storageFeePrice <= 0) return [];
  let start = input.arrivalDate;
  let remaining = input.quantity;
  const segments: { quantity: number; days: number; fee: number }[] = [];
  for (const out of [...input.outboundHistory].filter((entry) => entry.date && entry.quantity > 0).sort((a, b) => a.date.localeCompare(b.date))) {
    const days = Math.round((Date.parse(out.date) - Date.parse(start)) / 86400000);
    if (days > 0 && remaining > 0) segments.push({ quantity: remaining, days, fee: input.storageFeePrice * remaining * days });
    remaining -= out.quantity;
    start = out.date;
  }
  return segments;
}
export function storageFee(input: FeeInput) {
  // Reference billing ends at the last withdrawal; remaining goods do not
  // accrue an additional implicit segment through today.
  return input.outboundHistory.some((entry) => entry.date && entry.quantity > 0) ? storageSegments(input).reduce((sum, segment) => sum + segment.fee, 0) : input.quantity * input.storageFeePrice * input.storageFeeDays;
}
