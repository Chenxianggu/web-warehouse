import { z } from "zod";
import { orderDateSchema, type OrderRecord } from "@/features/customer-orders/schema";

const optionalDate = z.union([z.literal(""), orderDateSchema]);

export const orderSearchSchema = z.object({
  orderNo: z.string().trim().max(50, "订单号最多输入 50 个字符").default(""),
  customer: z.string().trim().max(255, "客户关键词最多输入 255 个字符").default(""),
  startDate: optionalDate.default(""),
  endDate: optionalDate.default(""),
  page: z.number().int().min(1).default(1),
  pageSize: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(100)]).default(20),
}).refine((filter) => Boolean(filter.startDate) === Boolean(filter.endDate), "请选择完整的订单日期范围")
  .refine((filter) => !filter.startDate || !filter.endDate || filter.startDate <= filter.endDate, "开始日期不能晚于结束日期");

export type OrderSearchFilter = z.infer<typeof orderSearchSchema>;
export type OrderSearchPage = { data: OrderRecord[]; total: number; page: number; pageSize: number };
export const emptyOrderSearch = { orderNo: "", customer: "", startDate: "", endDate: "" };
