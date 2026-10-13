import { z } from "zod";

const amount = z.number().finite().min(0).max(999999999).multipleOf(0.01).nullable();
const rowSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1, "请填写每行的塑料编号").max(50, "塑料编号最多 50 个字"),
  price: amount,
});

export const priceGroupsSchema = z.array(z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "请填写类别名称").max(50, "类别名称最多 50 个字"),
  rows: z.array(rowSchema).max(100, "每个类别最多 100 行"),
})).min(1, "至少保留一个类别").max(20, "最多添加 20 个类别").superRefine((groups, ctx) => {
  const ids = groups.flatMap((group) => [group.id, ...group.rows.map((row) => row.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "类别或行标识重复，请刷新后重试" });
  if (groups.reduce((count, group) => count + group.rows.length, 0) > 1000) {
    ctx.addIssue({ code: "custom", message: "价格表最多保存 1000 行" });
  }
});

export type PriceGroup = z.infer<typeof priceGroupsSchema>[number];
export type PriceRow = PriceGroup["rows"][number];
export type PriceStock = { code: string; name: string; packs: number };
export type PriceTableData = { groups: PriceGroup[]; version: number; updatedAt: string | null };

export function stockForCode(stock: PriceStock[], code: string) {
  const key = code.trim().toLocaleLowerCase();
  return stock.find((item) => item.code.trim().toLocaleLowerCase() === key);
}
