"use server";

import { revalidatePath } from "next/cache";
import { requirePageAccess } from "@/server/menu-permissions";
import { getPrisma } from "@/server/db";

const path = "/customers";

async function authorize() {
  await requirePageAccess(path);
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
  await authorize();
  const code = text(formData.get("code"));
  const fullName = text(formData.get("fullName"));
  if (!code || !fullName) return { ok: false, message: "客户编号和客户姓名不能为空" };
  try {
    await getPrisma().customer.create({ data: { code, fullName } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return { ok: false, message: "客户编号已存在" };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function updateCustomer(formData: FormData) {
  await authorize();
  const id = Number(text(formData.get("id")));
  const code = text(formData.get("code"));
  const fullName = text(formData.get("fullName"));
  if (!id || !code || !fullName) return { ok: false, message: "客户编号和客户姓名不能为空" };
  const db = getPrisma();
  const old = await db.customer.findUnique({ where: { id }, select: { code: true } });
  if (!old) return { ok: false, message: "客户不存在" };
  try {
    await db.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { code, fullName } });
      if (old.code !== code) await tx.receiverHistory.updateMany({ where: { customerCode: old.code }, data: { customerCode: code } });
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return { ok: false, message: "客户编号已存在或收货地址重复" };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function deleteCustomer(id: number) {
  await authorize();
  await getPrisma().$transaction(async (tx) => {
    const customer = await tx.customer.delete({ where: { id } });
    await tx.receiverHistory.deleteMany({ where: { customerCode: customer.code } });
  });
  revalidatePath(path);
  return { ok: true };
}

export async function saveReceiver(formData: FormData) {
  await authorize();
  const id = Number(text(formData.get("id")));
  const customerCode = text(formData.get("customerCode"));
  const receiver = text(formData.get("receiver"));
  if (!customerCode || !receiver) return { ok: false, message: "收货地址不能为空" };
  try {
    if (id) await getPrisma().receiverHistory.update({ where: { id }, data: { receiver } });
    else await getPrisma().receiverHistory.create({ data: { customerCode, receiver } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return { ok: false, message: "该收货地址已存在" };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function deleteReceiver(id: number) {
  await authorize();
  await getPrisma().receiverHistory.delete({ where: { id } });
  revalidatePath(path);
  return { ok: true };
}
