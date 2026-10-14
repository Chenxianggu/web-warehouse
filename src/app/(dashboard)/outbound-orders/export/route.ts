import { requirePageAccess } from "@/server/menu-permissions";
import { readOutboundOrders } from "@/server/outbound-orders";
import { buildOutboundWorkbook } from "@/server/outbound-export";
import { orderDateSchema } from "@/features/customer-orders/schema";

export async function GET(request: Request) {
  await requirePageAccess("/outbound-orders");
  const params = new URL(request.url).searchParams;
  const date = params.get("date") || "";
  const customer = (params.get("customer") || "").trim();
  if (!orderDateSchema.safeParse(date).success || customer.length > 255) return Response.json({ error: "请先选择有效日期" }, { status: 400 });
  const orders = await readOutboundOrders({ isShipped: true, date, customer, page: 1, pageSize: 100 }, true);
  if (!orders.data.some((order) => order.items.length)) return Response.json({ error: "没有可导出的数据" }, { status: 404 });
  const buffer = await buildOutboundWorkbook(orders.data);
  return new Response(new Uint8Array(buffer), { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`已出库订单_${date}.xlsx`)}`,
    "Cache-Control": "no-store",
  } });
}
