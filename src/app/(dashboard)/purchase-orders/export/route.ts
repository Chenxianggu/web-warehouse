import { requirePageAccess } from "@/server/menu-permissions";
import { purchaseFilterSchema } from "@/features/purchase-orders/schema";
import { readPurchaseOrders } from "@/server/purchase-orders";
import { buildPurchaseWorkbook } from "@/server/purchase-export";
export async function GET(request: Request) {
  await requirePageAccess("/purchase-orders"); const params = new URL(request.url).searchParams;
  const parsed = purchaseFilterSchema.safeParse(Object.fromEntries(["date", "arrivalDate", "supplier", "itemCode", "category", "status"].map((key) => [key, params.get(key) || ""])));
  if (!parsed.success) return Response.json({ error: "筛选条件无效" }, { status: 400 });
  const result = await readPurchaseOrders(parsed.data, true);
  if (!result.total) return Response.json({ error: "当前筛选条件下没有订货数据" }, { status: 404 });
  const buffer = await buildPurchaseWorkbook(result.data);
  const filename = ["订货记录", parsed.data.date, parsed.data.supplier].filter(Boolean).join("_").replace(/[\\/:*?"<>|]/g, "_");
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename + ".xlsx")}`, "Cache-Control": "no-store" } });
}
