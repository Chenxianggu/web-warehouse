import { requirePageAccess } from "@/server/menu-permissions";
import { readConsignments } from "@/server/consignments";
import { buildConsignmentWorkbook } from "@/server/consignment-export";
import { consignmentFilterSchema } from "@/features/consignments/schema";
import { shanghaiToday } from "@/features/customer-orders/schema";

export async function GET(request: Request) {
  await requirePageAccess("/consignments");
  const params = new URL(request.url).searchParams;
  const parsed = consignmentFilterSchema.safeParse(Object.fromEntries(["date", "arrivalDate", "customerName", "itemCode", "status"].map((key) => [key, params.get(key) || ""])));
  if (!parsed.success) return Response.json({ error: "筛选条件无效" }, { status: 400 });
  const result = await readConsignments(parsed.data, true);
  if (!result.total) return Response.json({ error: "没有可导出的数据" }, { status: 404 });
  const buffer = await buildConsignmentWorkbook(result.data);
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`客户寄存_${shanghaiToday()}.xlsx`)}`,
    "Cache-Control": "no-store",
  } });
}
