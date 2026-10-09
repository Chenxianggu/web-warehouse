"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/server/db";
import { requirePageAccess } from "@/server/menu-permissions";

const path = "/inbound-orders";
const SHANGHAI_OFFSET = "+08:00";

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDateStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const result = new Date(`${value}T00:00:00${SHANGHAI_OFFSET}`);
  return Number.isNaN(result.getTime()) ? null : result;
}

function parseDateEndExclusive(value: string) {
  const start = parseDateStart(value);
  if (!start) return null;
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

export async function listInboundMaterials() {
  await requirePageAccess(path);
  return getPrisma().material.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, code: true, name: true },
  });
}

export async function listInboundRecords(startDate = "", endDate = "", page = 1, pageSize = 10) {
  await requirePageAccess(path);
  const safePage = Math.max(1, Math.floor(page));
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const start = startDate ? parseDateStart(startDate) : null;
  const end = endDate ? parseDateEndExclusive(endDate) : null;
  const where = start || end
    ? { createdAt: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } }
    : undefined;
  const db = getPrisma();
  const [records, total] = await Promise.all([
    db.inboundRecord.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
        { sourceType: { sort: "asc", nulls: "first" } },
        { id: "desc" },
      ],
      skip: (safePage - 1) * safeSize,
      take: safeSize,
      select: {
        id: true,
        code: true,
        name: true,
        packCount: true,
        inboundUnitPrice: true,
        taxIncluded: true,
        createdAt: true,
      },
    }),
    db.inboundRecord.count({ where }),
  ]);

  return {
    data: records.map((record) => ({
      ...record,
      packCount: Number(record.packCount),
      inboundUnitPrice: record.inboundUnitPrice === null ? null : Number(record.inboundUnitPrice),
      createdAt: record.createdAt.toISOString(),
    })),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}

export async function createInboundRecord(formData: FormData) {
  await requirePageAccess(path);
  const code = text(formData.get("code"));
  const name = text(formData.get("name"));
  const packCount = Number(text(formData.get("packCount")));
  const inboundUnitPrice = Number(text(formData.get("inboundUnitPrice")));
  const taxIncluded = text(formData.get("taxIncluded")) === "true";
  const createdAtText = text(formData.get("createdAt"));
  const createdAt = createdAtText ? parseDateStart(createdAtText) : null;

  if (!code || !name) return { ok: false, message: "塑料编号和塑料名称不能为空" };
  if (!Number.isInteger(packCount) || packCount < 1) return { ok: false, message: "包数必须是大于零的整数" };
  if (!Number.isFinite(inboundUnitPrice) || inboundUnitPrice < 0) return { ok: false, message: "入库价格必须是有效的非负数" };
  if (createdAtText && !createdAt) return { ok: false, message: "入库日期格式不正确" };

  await getPrisma().inboundRecord.create({
    data: {
      code,
      name,
      packCount,
      inboundUnitPrice,
      taxIncluded,
      ...(createdAt ? { createdAt } : {}),
    },
  });
  revalidatePath(path);
  revalidatePath("/stock");
  return { ok: true };
}

export async function deleteInboundRecord(id: number) {
  await requirePageAccess(path);
  try {
    await getPrisma().inboundRecord.delete({ where: { id } });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2025") {
      return { ok: false, message: "记录不存在或已被删除" };
    }
    throw error;
  }
  revalidatePath(path);
  revalidatePath("/stock");
  return { ok: true };
}
