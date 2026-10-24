import { z } from "zod";
import { warehouseSchema } from "@/features/inventory/warehouse";
import { orderDateSchema } from "@/features/customer-orders/schema";
const optionalDate = z.union([z.literal(""), orderDateSchema]);
const quantity = z.number().min(0).max(999999999.999).refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < .001, "数量最多保留三位小数");
export const purchaseFilterSchema = z.object({
  date: optionalDate.default(""), arrivalDate: optionalDate.default(""), supplier: z.string().trim().max(255).default(""),
  itemCode: z.string().trim().max(100).default(""), category: z.string().trim().max(100).default(""), status: z.enum(["", "unfinished", "finished"]).default(""),
  page: z.number().int().positive().default(1), pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20),
});
export const purchaseInputSchema = z.object({
  id: z.number().int().positive().nullable(), updatedAt: z.string().datetime().nullable(), orderDate: orderDateSchema,
  supplier: z.string().trim().min(1, "请输入供货方").max(255), itemCode: z.string().trim().min(1, "请输入货号").max(100), category: z.string().trim().max(100),
  quantity, unitPrice: z.number().min(0).max(9999999999.99).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < .001, "单价最多保留两位小数"),
  taxIncluded: z.boolean(), remittanceInCompany: z.string().trim().max(255), remittanceOutCompany: z.string().trim().max(255), remittanceDate: optionalDate,
  warehouse: warehouseSchema.default("MAIN"),
  deliveryInfo: z.string().trim().max(255), arrivalDate: optionalDate, status: z.enum(["unfinished", "finished"]), remark: z.string().trim().max(10000),
}).superRefine((value, ctx) => {
  if (value.id !== null && !value.updatedAt) ctx.addIssue({ code: "custom", message: "请重新打开记录后保存" });
  if (value.quantity * value.unitPrice > 9999999999.99) ctx.addIssue({ code: "custom", message: "金额超出允许范围" });
});
export const deliveryInputSchema = z.object({ orderId: z.number().int().positive(), updatedAt: z.string().datetime().optional(), deliveryDate: orderDateSchema, quantity: quantity.refine((n) => n > 0, "本次数量必须大于零") });
export type PurchaseFilter = z.infer<typeof purchaseFilterSchema>;
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;
export type DeliveryInput = z.infer<typeof deliveryInputSchema>;
export type DeliveryRecord = { id: number; deliveryDate: string; quantity: number; synced: boolean };
export type PurchaseRecord = Omit<PurchaseInput, "id" | "updatedAt"> & { id: number; updatedAt: string; amount: number; deliverySum: number; deliveries: DeliveryRecord[]; effectiveStatus: "finished" | "unfinished" };
export type PurchasePage = { data: PurchaseRecord[]; total: number; page: number; pageSize: number };
export const emptyPurchaseFilter: PurchaseFilter = { date: "", arrivalDate: "", supplier: "", itemCode: "", category: "", status: "", page: 1, pageSize: 20 };
export function deliveryStatus(quantity: number, deliverySum: number, status: string): "finished" | "unfinished" {
  return deliverySum > 0 ? (deliverySum >= quantity ? "finished" : "unfinished") : status === "finished" ? "finished" : "unfinished";
}
