"use server";

import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { readReceivables, readReceivableDetail, persistReceivablePayment, removeReceivablePayment } from "@/server/receivables";

const path = "/receivables";

export async function queryReceivables() {
  await requirePageAccess(path);
  return readReceivables();
}

export async function getReceivableDetail(customerCode: string) {
  await requirePageAccess(path);
  return readReceivableDetail(customerCode);
}

export async function createPayment(input: unknown) {
  const user = await requirePageAccess(path);
  const result = await persistReceivablePayment(input, user);
  if (result.ok) revalidatePath(path);
  return result;
}

export async function deletePayment(id: number) {
  const user = await requirePageAccess(path);
  const result = await removeReceivablePayment(id, user);
  if (result.ok) revalidatePath(path);
  return result;
}
