"use server";

import { requirePageAccess } from "@/server/menu-permissions";
import { searchCustomerOrders } from "@/server/order-search";
import { readCustomerOrders } from "@/server/customer-orders";
import type { OrderSearchFilter } from "@/features/order-search/schema";

const path = "/order-search";

export async function queryOrders(filter: OrderSearchFilter) {
  await requirePageAccess(path);
  return searchCustomerOrders(filter);
}

export async function getSearchOrder(id: number) {
  await requirePageAccess(path);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return (await readCustomerOrders("", id))[0] ?? null;
}
