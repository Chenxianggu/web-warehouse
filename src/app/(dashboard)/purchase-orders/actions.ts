"use server";
import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { getPrisma } from "@/server/db";
import { readPurchaseOrders, persistPurchaseOrder, removePurchaseOrder, addPurchaseDelivery, removePurchaseDelivery } from "@/server/purchase-orders";
import type { PurchaseFilter } from "@/features/purchase-orders/schema";

export async function listPurchaseOrders(filter: PurchaseFilter) {
  await requirePageAccess("/purchase-orders"); return readPurchaseOrders(filter);
}
export async function purchaseOptions() {
  await requirePageAccess("/purchase-orders"); const db = getPrisma();
  const [customers, materials, categories] = await Promise.all([
    db.customer.findMany({ select: { id: true, code: true, fullName: true }, orderBy: { fullName: "asc" } }),
    db.material.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
    db.purchaseOrder.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" }, where: { category: { not: "" } } }),
  ]);
  return { suppliers: customers.map((r) => ({ id: r.id, code: r.code, name: r.fullName })), materials, categories: categories.map((r) => r.category) };
}
function invalidate() { for (const path of ["/purchase-orders", "/price-trends", "/stock", "/inbound-orders", "/"]) revalidatePath(path); }
export async function savePurchaseOrder(input: unknown) {
  await requirePageAccess("/purchase-orders"); const result = await persistPurchaseOrder(input); if (result.ok) invalidate(); return result;
}
export async function deletePurchaseOrder(id: number, updatedAt: string) {
  await requirePageAccess("/purchase-orders"); const result = await removePurchaseOrder(id, updatedAt); if (result.ok) invalidate(); return result;
}
export async function addDelivery(input: unknown) {
  await requirePageAccess("/purchase-orders"); const result = await addPurchaseDelivery(input); if (result.ok) invalidate(); return result;
}
export async function deleteDelivery(orderId: number, deliveryId: number, updatedAt: string) {
  await requirePageAccess("/purchase-orders"); const result = await removePurchaseDelivery(orderId, deliveryId, updatedAt); if (result.ok) invalidate(); return result;
}
