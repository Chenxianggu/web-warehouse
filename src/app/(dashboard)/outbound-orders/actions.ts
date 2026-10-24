"use server";

import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { readCustomerOrders } from "@/server/customer-orders";
import { readOutboundOrders, shipCustomerOrder, unshipCustomerOrder } from "@/server/outbound-orders";
import type { OutboundFilter } from "@/features/outbound/schema";
import type { Warehouse } from "@/features/inventory/warehouse";

const path = "/outbound-orders";
export async function listOutboundOrders(filter: OutboundFilter) {
  await requirePageAccess(path);
  return readOutboundOrders(filter);
}
export async function getOutboundOrder(id: number) {
  await requirePageAccess(path);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return (await readCustomerOrders("", id))[0] ?? null;
}
function invalidate() {
  for (const route of [path, "/customer-orders", "/stock", "/inbound-orders", "/consignments", "/"]) revalidatePath(route);
}
export async function shipOrder(id: number, warehouse?: Warehouse) {
  const user = await requirePageAccess(path);
  const result = await shipCustomerOrder(id, user, warehouse);
  if (result.ok) invalidate();
  return result;
}
export async function unshipOrder(id: number) {
  const user = await requirePageAccess(path);
  const result = await unshipCustomerOrder(id, user);
  if (result.ok) invalidate();
  return result;
}
