"use server";

import { requirePageAccess } from "@/server/menu-permissions";
import { readPurchaseItemCodes, readPurchasePriceHistory } from "@/server/price-trends";
import type { PriceTrendQuery } from "@/features/price-trends/schema";

export async function queryPriceHistory(query: PriceTrendQuery) {
  await requirePageAccess("/price-trends");
  return readPurchasePriceHistory(query);
}

export async function queryPriceItemCodes() {
  await requirePageAccess("/price-trends");
  return readPurchaseItemCodes();
}
