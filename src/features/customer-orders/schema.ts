import { z } from "zod";

export const orderDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "请选择有效的订单日期");

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max, `最多输入 ${max} 个字符`);

export const customerOrderSchema = z.object({
  id: z.number().int().positive().nullable(),
  customerCode: requiredText(50, "请输入或选择客户编号"),
  customerName: requiredText(255, "请输入客户名称"),
  receiver: requiredText(255, "请输入收货单位"),
  orderDate: orderDateSchema,
  deductFutures: z.boolean(),
  items: z.array(z.object({
    code: requiredText(50, "明细的编号/名称/包数必填"),
    name: requiredText(255, "明细的编号/名称/包数必填"),
    packCount: z.number().int("包数必须是整数").min(1, "包数必须大于零").max(9999999999),
    unitPrice: z.number().min(0, "单价不能小于零").max(9999999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, "单价最多保留两位小数"),
    remark: z.string().trim().max(500, "备注最多输入 500 个字符"),
  })).min(1, "至少保留一行明细"),
});

export type CustomerOrderInput = z.infer<typeof customerOrderSchema>;
export type OrderItem = { code: string; name: string; packCount: number; unitPrice: number; packsPerTon: number; remark: string };
export type OrderRecord = {
  id: number; orderNo: string; customerCode: string; customerName: string;
  receiver: string; orderDate: string; isShipped: boolean; deductFutures: boolean;
  createdAt: string; items: OrderItem[];
};
export type OrderOptions = {
  customers: { code: string; name: string }[];
  materials: { code: string; name: string; packsPerTon: number }[];
};

export function lineSubtotal(item: { unitPrice: number; packCount: number; packsPerTon: number }) {
  return item.unitPrice / (item.packsPerTon > 0 ? item.packsPerTon : 40) * item.packCount;
}

export function shanghaiToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
}
