import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { redactText, sanitizeLogData } from "@/features/logs/sanitize";
import type { AuditActor } from "@/server/audit";

type LogInput = {
  category?: "AUTH" | "SYSTEM";
  level?: "INFO" | "WARN" | "ERROR";
  status?: "SUCCESS" | "FAILURE";
  module: string;
  action: string;
  message: string;
  actor?: AuditActor;
  requestId?: string;
  metadata?: unknown;
};

export async function writeLog(input: LogInput) {
  const metadata = sanitizeLogData(input.metadata);
  const data = {
    category: input.category ?? "SYSTEM", level: input.level ?? "INFO", status: input.status ?? "SUCCESS",
    module: input.module.slice(0, 64), action: input.action.slice(0, 64), message: redactText(input.message),
    actorId: input.actor?.id.slice(0, 100), actorName: redactText(input.actor?.username ?? "系统").slice(0, 100),
    requestId: input.requestId?.slice(0, 100) ?? randomUUID(),
    metadata: metadata === null ? Prisma.JsonNull : metadata as Prisma.InputJsonValue,
  };
  const output = JSON.stringify({ timestamp: new Date().toISOString(), service: "warehouse", environment: process.env.NODE_ENV ?? "development", release: process.env.APP_RELEASE ?? "development", ...data, metadata });
  if (data.level === "ERROR") console.error(output);
  else if (data.level === "WARN") console.warn(output);
  else console.info(output);
  // Runtime output is collected independently by Alloy/Loki, even when Postgres is down.
  if (data.category === "SYSTEM") return;
  try {
    await getPrisma().systemLog.create({ data });
  } catch {
    // Never recurse into the failing database or fail a login/error response.
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: "ERROR", action: "LOG_STORAGE_FAILED", requestId: data.requestId, message: "日志写入数据库失败，原事件已输出至标准日志" }));
  }
}
