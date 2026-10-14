"use server";
import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { getPrisma } from "@/server/db";
import { readFullContainers, persistFullContainer, removeFullContainer } from "@/server/full-containers";
import type { ContainerFilter } from "@/features/full-containers/schema";
export async function listFullContainers(filter: ContainerFilter) { await requirePageAccess("/full-container-sales"); return readFullContainers(filter); }
export async function containerOptions() {
  await requirePageAccess("/full-container-sales"); const db = getPrisma();
  const [customers, materials, suppliers] = await Promise.all([db.customer.findMany({ select: { code: true, fullName: true }, orderBy: { fullName: "asc" } }), db.material.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }), db.fullContainerRecord.findMany({ distinct: ["supplier"], select: { supplier: true }, orderBy: { supplier: "asc" }, where: { supplier: { not: "" } } })]);
  return { customers: customers.map((c) => ({ code: c.code, name: c.fullName })), materials, suppliers: suppliers.map((s) => s.supplier) };
}
function invalidate() { for (const path of ["/full-container-sales", "/consignments", "/stock", "/inbound-orders", "/receivables", "/"]) revalidatePath(path); }
export async function saveFullContainer(input: unknown) { await requirePageAccess("/full-container-sales"); const result = await persistFullContainer(input); if (result.ok) invalidate(); return result; }
export async function deleteFullContainer(id: number, updatedAt: string) { await requirePageAccess("/full-container-sales"); const result = await removeFullContainer(id, updatedAt); if (result.ok) invalidate(); return result; }
