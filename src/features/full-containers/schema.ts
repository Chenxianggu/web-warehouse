import { z } from "zod";
import { orderDateSchema } from "@/features/customer-orders/schema";
const date = z.union([z.literal(""), orderDateSchema]);
const price = z.number().min(0).max(9999999999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < .001, "单价最多保留两位小数");
export const containerFilterSchema = z.object({ startDate: date.default(""), endDate: date.default(""), buyer: z.string().trim().max(255).default(""), supplier: z.string().trim().max(255).default(""), itemName: z.string().trim().max(100).default(""), page: z.number().int().positive().default(1), pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20) }).refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, "开始日期不能晚于结束日期");
export const containerInputSchema = z.object({
  id: z.number().int().positive().nullable(), updatedAt: z.string().datetime().nullable(), orderDate: orderDateSchema,
  buyer: z.string().trim().max(255), itemName: z.string().trim().max(100), quantity: z.number().min(0).max(999999999.999).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < .001, "数量最多保留三位小数"),
  unitPrice: price, taxIncluded: z.boolean(), deliveryInfo: z.string().trim().max(255), warehouseOnArrival: z.boolean(), remark: z.string().trim().max(10000),
  supplier: z.string().trim().max(255), supplyOrderDate: date, supplyUnitPrice: price, supplyTaxIncluded: z.boolean(), followStatus: z.string().trim().max(255), delivered: z.boolean(), deliveryDate: date, supplyRemark: z.string().trim().max(10000),
}).superRefine((v, ctx) => {
  if (v.id && !v.updatedAt) ctx.addIssue({ code: "custom", message: "请重新打开记录后保存" });
  if (v.quantity * v.unitPrice > 9999999999.99 || (!v.warehouseOnArrival && v.quantity * v.supplyUnitPrice > 9999999999.99)) ctx.addIssue({ code: "custom", message: "金额超出允许范围" });
});
export type ContainerFilter = z.infer<typeof containerFilterSchema>;
export type ContainerInput = z.infer<typeof containerInputSchema>;
export type ContainerRecord = Omit<ContainerInput, "id" | "updatedAt"> & { id: number; updatedAt: string; amount: number; supplyAmount: number };
export type ContainerPage = { data: ContainerRecord[]; total: number; page: number; pageSize: number };
export const emptyContainerFilter: ContainerFilter = { startDate: "", endDate: "", buyer: "", supplier: "", itemName: "", page: 1, pageSize: 20 };
export function clearSupply<T extends ContainerInput>(row: T): T {
  return { ...row, supplier: "", supplyOrderDate: "", supplyUnitPrice: 0, supplyTaxIncluded: false, followStatus: "", delivered: false, deliveryDate: "", supplyRemark: "" };
}
