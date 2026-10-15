"use server";

import { auditTransaction } from "@/server/audit";

import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { getPrisma } from "@/server/db";
import { deleteCustomerRecord, updateCustomerRecord } from "@/server/customer-directory";

const path = "/customers";

async function authorize() {
  return requirePageAccess(path);
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function listCustomers(keyword = "", page = 1, pageSize = 10) {
  await authorize();
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const where = keyword.trim()
    ? { OR: [{ code: { contains: keyword.trim(), mode: "insensitive" as const } }, { fullName: { contains: keyword.trim(), mode: "insensitive" as const } }] }
    : undefined;
  const db = getPrisma();
  const [data, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { createdAt: "desc" }, skip: (safePage - 1) * safeSize, take: safeSize, select: { id: true, code: true, fullName: true, createdAt: true } }),
    db.customer.count({ where }),
  ]);
  return { data, total, page: safePage, pageSize: safeSize };
}

export async function listReceivers(customerCode: string) {
  await authorize();
  return getPrisma().receiverHistory.findMany({ where: { customerCode }, orderBy: { id: "desc" }, select: { id: true, receiver: true } });
}

export async function createCustomer(formData: FormData) {
  const user = await authorize();
  const code = text(formData.get("code"));
  const fullName = text(formData.get("fullName"));
  if (!code || !fullName) return { ok: false, message: "客户编号和客户姓名不能为空" };
  await auditTransaction(user, async (tx) => tx.customer.create({ data: { code, fullName } }));
  revalidatePath(path);
  return { ok: true };
}

export async function updateCustomer(formData: FormData) {
  const user = await authorize();
  const id = Number(text(formData.get("id")));
  const code = text(formData.get("code"));
  const fullName = text(formData.get("fullName"));
  if (!id || !code || !fullName) return { ok: false, message: "客户编号和客户姓名不能为空" };
  if (!(await updateCustomerRecord(id, code, fullName, user))) return { ok: false, message: "客户不存在" };
  revalidatePath(path);
  return { ok: true };
}

export async function deleteCustomer(id: number) {
  const user = await authorize();
  await deleteCustomerRecord(id, user);
  revalidatePath(path);
  return { ok: true };
}

export async function saveReceiver(formData: FormData) {
  const user = await authorize();
  const id = Number(text(formData.get("id")));
  const customerCode = text(formData.get("customerCode"));
  const receiver = text(formData.get("receiver"));
  if (!customerCode || !receiver) return { ok: false, message: "收货地址不能为空" };
  try {
    if (id) await auditTransaction(user, async (tx) => tx.receiverHistory.update({ where: { id }, data: { receiver } }));
    else await auditTransaction(user, async (tx) => tx.receiverHistory.create({ data: { customerCode, receiver } }));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return { ok: false, message: "该收货地址已存在" };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function deleteReceiver(id: number) {
  const user = await authorize();
  await auditTransaction(user, async (tx) => tx.receiverHistory.delete({ where: { id } }));
  revalidatePath(path);
  return { ok: true };
}
