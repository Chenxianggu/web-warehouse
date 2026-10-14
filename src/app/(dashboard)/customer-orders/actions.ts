"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/server/db";
import { requirePageAccess } from "@/server/menu-permissions";
import { persistCustomerOrder, readCustomerOrders, removeCustomerOrder } from "@/server/customer-orders";
import type { OrderOptions } from "@/features/customer-orders/schema";

const path = "/customer-orders";

export async function listCustomerOrders(date: string) {
  await requirePageAccess(path);
  return readCustomerOrders(date);
}

export async function getCustomerOrder(id: number) {
  await requirePageAccess(path);
  if (!Number.isSafeInteger(id) || id < 1) return null;
  return (await readCustomerOrders("", id))[0] ?? null;
}

export async function listOrderOptions(): Promise<OrderOptions> {
  await requirePageAccess(path);
  const [customers, materials] = await Promise.all([
    getPrisma().customer.findMany({ orderBy: { id: "desc" }, select: { code: true, fullName: true } }),
    getPrisma().material.findMany({ orderBy: { id: "desc" }, select: { code: true, name: true, packsPerTon: true } }),
  ]);
  return { customers: customers.map(({ code, fullName }) => ({ code, name: fullName })), materials };
}

export async function listOrderReceivers(customerCode: string) {
  await requirePageAccess(path);
  const rows = await getPrisma().receiverHistory.findMany({
    where: customerCode ? { customerCode } : undefined,
    orderBy: { id: "desc" }, select: { receiver: true }, distinct: ["receiver"],
  });
  return rows.map((row) => row.receiver);
}

export async function saveCustomerOrder(input: unknown) {
  await requirePageAccess(path);
  const result = await persistCustomerOrder(input);
  if (result.ok) {
    revalidatePath(path);
    revalidatePath("/customers");
  }
  return result;
}

export async function deleteCustomerOrder(id: number) {
  await requirePageAccess(path);
  const result = await removeCustomerOrder(id);
  if (result.ok) revalidatePath(path);
  return result;
}
