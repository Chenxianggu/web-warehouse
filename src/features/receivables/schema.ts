import { z } from "zod";

export const paymentSchema = z.object({
  customerCode: z.string().trim().min(1, "请输入或选择客户编号").max(300, "客户编号过长"),
  customerName: z.string().trim().min(1, "请输入客户名称").max(255, "客户名称最多 255 个字符"),
  amount: z.number().finite().min(0.01, "支付金额必须大于0").max(9999999999.99, "支付金额超出范围")
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.001, "支付金额最多保留两位小数"),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "请选择支付日期").refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "请选择有效的支付日期"),
  remark: z.string().trim().max(10000, "备注最多 10000 个字符"),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
export type ReceivableRow = { customerCode: string; customerName: string; totalAmount: number; paidAmount: number; receivableAmount: number };
export type ReceivableOrder = { id: string; orderNo: string; orderDate: string; orderAmount: number };
export type PaymentRecord = PaymentInput & { id: number; createdAt: string };
export type ReceivableDetail = {
  customer: { code: string; name: string };
  orders: ReceivableOrder[]; payments: PaymentRecord[];
  totalAmount: number; paidAmount: number; receivableAmount: number;
};
