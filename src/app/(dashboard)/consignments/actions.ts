"use server";

import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { readConsignments, persistConsignment, removeConsignment } from "@/server/consignments";
import type { ConsignmentFilter } from "@/features/consignments/schema";
import { getPrisma } from "@/server/db";

export async function listConsignments(filter: ConsignmentFilter) {
  await requirePageAccess("/consignments");
  return readConsignments(filter);
}
export async function consignmentOptions() {
  await requirePageAccess("/consignments");
  const db = getPrisma();
  const [customers, materials] = await Promise.all([
    db.customer.findMany({ orderBy: { code: "asc" }, select: { code: true, fullName: true } }),
    db.material.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true, packsPerTon: true } }),
  ]);
  return { customers: customers.map((row) => ({ code: row.code, name: row.fullName })), materials };
}
function invalidate() {
  for (const path of ["/consignments", "/outbound-orders", "/receivables", "/"]) revalidatePath(path);
}
export async function saveConsignment(input: unknown) {
  await requirePageAccess("/consignments");
  const result = await persistConsignment(input);
  if (result.ok) invalidate();
  return result;
}
export async function deleteConsignment(id: number, updatedAt: string) {
  await requirePageAccess("/consignments");
  const result = await removeConsignment(id, updatedAt);
  if (result.ok) invalidate();
  return result;
}
