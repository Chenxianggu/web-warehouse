"use server";

import { auditTransaction } from "@/server/audit";

import { revalidatePath } from "next/cache";
import { UserRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { requirePageAccess } from "@/server/menu-permissions";
import { summarizeStock } from "@/features/inventory/stock";

const path = "/stock";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedPacksPerTon(value: FormDataEntryValue | null) {
  const parsed = Number(text(value));
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) return null;
  return parsed;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function listMaterials(keyword = "", page = 1, pageSize = 10) {
  const user = await requirePageAccess(path);
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const term = keyword.trim();
  const where = term
    ? {
        OR: [
          { code: { contains: term, mode: "insensitive" as const } },
          { name: { contains: term, mode: "insensitive" as const } },
        ],
      }
    : undefined;
  const db = getPrisma();
  const [materials, total] = await Promise.all([
    db.material.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      select: { id: true, code: true, name: true, packsPerTon: true, createdAt: true },
    }),
    db.material.count({ where }),
  ]);

  const inbound = materials.length
    ? await db.inboundRecord.findMany({
        where: { code: { in: materials.map((item) => item.code), mode: "insensitive" } },
        select: { code: true, packCount: true, inboundUnitPrice: true, taxIncluded: true, warehouse: true },
      })
    : [];
  const inboundByCode = new Map<string, typeof inbound>();
  for (const record of inbound) {
    const key = record.code.trim().toLocaleLowerCase();
    const records = inboundByCode.get(key) ?? [];
    records.push(record);
    inboundByCode.set(key, records);
  }

  const data = materials.map((material) => {
    const records = inboundByCode.get(material.code.trim().toLocaleLowerCase()) ?? [];
    return {
      ...material,
      createdAt: material.createdAt.toISOString(),
      ...summarizeStock(records.map((record) => ({
        ...record,
        packCount: Number(record.packCount),
        inboundUnitPrice: record.inboundUnitPrice === null ? null : Number(record.inboundUnitPrice),
      })), material.packsPerTon),
    };
  });

  return {
    data,
    total,
    page: safePage,
    pageSize: safeSize,
    canViewAveragePrice: user.role === UserRole.SUPER_ADMIN,
  };
}

export async function createMaterial(formData: FormData) {
  const user = await requirePageAccess(path);
  const code = text(formData.get("code"));
  const name = text(formData.get("name"));
  const packsPerTon = normalizedPacksPerTon(formData.get("packsPerTon"));
  if (!code || !name) return { ok: false, message: "塑料编号和塑料名称不能为空" };
  if (packsPerTon === null) return { ok: false, message: "每吨包数必须是 1–200 之间的整数" };
  try {
    await auditTransaction(user, async (tx) => tx.material.create({ data: { code, name, packsPerTon } }));
  } catch (error) {
    if (isUniqueConstraintError(error)) return { ok: false, message: "塑料编号已存在" };
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function updateMaterial(formData: FormData) {
  const user = await requirePageAccess(path);
  const id = Number(text(formData.get("id")));
  const code = text(formData.get("code"));
  const name = text(formData.get("name"));
  const packsPerTon = normalizedPacksPerTon(formData.get("packsPerTon"));
  if (!id || !code || !name) return { ok: false, message: "塑料编号和塑料名称不能为空" };
  if (packsPerTon === null) return { ok: false, message: "每吨包数必须是 1–200 之间的整数" };
  try {
    await auditTransaction(user, async (tx) => tx.material.update({ where: { id }, data: { code, name, packsPerTon } }));
  } catch (error) {
    if (isUniqueConstraintError(error)) return { ok: false, message: "塑料编号已存在" };
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return { ok: false, message: "塑料不存在或已被删除" };
    }
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}

export async function deleteMaterial(id: number) {
  const user = await requirePageAccess(path);
  try {
    await auditTransaction(user, async (tx) => tx.material.delete({ where: { id } }));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return { ok: false, message: "塑料不存在或已被删除" };
    }
    throw error;
  }
  revalidatePath(path);
  return { ok: true };
}
