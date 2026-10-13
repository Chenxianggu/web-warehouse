"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { requireUser } from "@/server/current-user";
import { requirePageAccess } from "@/server/menu-permissions";
import { priceGroupsSchema, type PriceTableData } from "@/features/price-table/schema";

const tableId = "home";

async function canEditPriceTable(userId: string, role: UserRole) {
  if (role === UserRole.SUPER_ADMIN) return true;
  const grant = await getPrisma().plasticPriceEditor.findUnique({ where: { userId }, select: { userId: true } });
  return grant !== null;
}

export async function loadPlasticPriceTable() {
  // The home table exposes inventory and follows the existing inventory permission.
  const user = await requirePageAccess("/stock");
  const db = getPrisma();
  const [saved, materials, inbound, canEdit] = await Promise.all([
    db.plasticPriceTable.findUnique({ where: { id: tableId } }),
    db.material.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
    db.inboundRecord.groupBy({ by: ["code"], _sum: { packCount: true } }),
    canEditPriceTable(user.id, user.role),
  ]);
  // Match the case-insensitive code aggregation used by the inventory page.
  const packsByCode = new Map<string, number>();
  for (const record of inbound) {
    const key = record.code.trim().toLocaleLowerCase();
    packsByCode.set(key, (packsByCode.get(key) ?? 0) + Number(record._sum.packCount ?? 0));
  }
  const table: PriceTableData = {
    groups: saved ? priceGroupsSchema.parse(saved.groups) : ["丙料", "明改苯", "共聚", "AB", "高低压"].map((title) => ({ id: randomUUID(), title, rows: [] })),
    version: saved?.version ?? 0,
    updatedAt: saved?.updatedAt.toISOString() ?? null,
  };
  return {
    table,
    stock: materials.map((material) => ({ ...material, packs: packsByCode.get(material.code.trim().toLocaleLowerCase()) ?? 0 })),
    date: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(new Date()),
    canEdit,
    canManageEditors: user.role === UserRole.SUPER_ADMIN,
  };
}

export async function savePlasticPriceTable(input: unknown) {
  const user = await requirePageAccess("/stock");
  if (!(await canEditPriceTable(user.id, user.role))) return { ok: false as const, message: "没有编辑价格表的权限" };
  const parsed = z.object({ groups: priceGroupsSchema, version: z.number().int().min(0) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: parsed.error.issues[0]?.message ?? "请检查表格内容" };
  const { groups, version } = parsed.data;
  const db = getPrisma();
  const conflict = { ok: false as const, message: "价格表已被其他人更新，请先取消编辑并刷新，再重新修改" };
  const updatedAt = new Date();
  if (version === 0) {
    try {
      await db.plasticPriceTable.create({ data: { id: tableId, groups, updatedAt } });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") return conflict;
      throw error;
    }
  } else {
    const updated = await db.plasticPriceTable.updateMany({
      where: { id: tableId, version },
      data: { groups, version: { increment: 1 }, updatedAt },
    });
    if (updated.count === 0) return conflict;
  }
  revalidatePath("/");
  return { ok: true as const, table: { groups, version: version + 1, updatedAt: updatedAt.toISOString() } };
}

export async function loadPriceTableEditors() {
  const user = await requireUser();
  if (user.role !== UserRole.SUPER_ADMIN) return { ok: false as const, message: "只有超级管理员可以设置编辑权限" };
  const db = getPrisma();
  const [users, grants] = await Promise.all([
    db.user.findMany({
      where: { role: { not: UserRole.SUPER_ADMIN } },
      select: { id: true, username: true, isActive: true },
      orderBy: [{ isActive: "desc" }, { username: "asc" }],
    }),
    db.plasticPriceEditor.findMany({ select: { userId: true } }),
  ]);
  const granted = new Set(grants.map((item) => item.userId));
  return { ok: true as const, users: users.map((item) => ({ ...item, granted: granted.has(item.id) })) };
}

export async function savePriceTableEditors(userIds: string[]) {
  const user = await requireUser();
  if (user.role !== UserRole.SUPER_ADMIN) return { ok: false as const, message: "只有超级管理员可以设置编辑权限" };
  const parsed = z.array(z.string().trim().min(1).max(64)).max(200).safeParse(userIds);
  if (!parsed.success) return { ok: false as const, message: "请选择有效的账号" };
  const uniqueIds = [...new Set(parsed.data)];
  const db = getPrisma();
  const allowed = uniqueIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: uniqueIds }, role: { not: UserRole.SUPER_ADMIN } },
    select: { id: true },
  });
  if (allowed.length !== uniqueIds.length) return { ok: false as const, message: "包含无效账号，请重新打开授权名单" };
  await db.$transaction(async (tx) => {
    await tx.plasticPriceEditor.deleteMany();
    if (allowed.length > 0) await tx.plasticPriceEditor.createMany({ data: allowed.map((item) => ({ userId: item.id })) });
  });
  revalidatePath("/");
  return { ok: true as const };
}
