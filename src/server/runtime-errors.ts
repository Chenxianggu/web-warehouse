import { writeLog } from "@/server/logger";

const reported = new WeakSet<object>();
const unavailableCodes = new Set(["P1000", "P1001", "P1002", "P1008", "P1017", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "57P02", "57P03", "53300"]);
const expectedCodes = new Set(["P2002", "P2003", "P2025"]);
const unavailableKinds = new Set(["DatabaseNotReachable", "ConnectionClosed", "SocketTimeout", "TlsConnectionError", "AuthenticationFailed", "TooManyConnections"]);

export function errorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

export function isExpectedDatabaseError(error: unknown): boolean {
  return expectedCodes.has(errorCode(error));
}

export function isDatabaseUnavailable(error: unknown): boolean {
  function inspect(value: unknown, depth = 0): boolean {
    if (!value || typeof value !== "object" || depth > 4) return false;
    if (unavailableCodes.has(errorCode(value)) || /^08[0-9A-Z]{3}$/.test(errorCode(value))) return true;
    if ("kind" in value && typeof value.kind === "string" && unavailableKinds.has(value.kind)) return true;
    // Prisma 7 adapters expose structured failures inside cause or meta.
    for (const key of ["cause", "meta", "driverAdapterError"] as const) {
      if (key in value && inspect((value as Record<string, unknown>)[key], depth + 1)) return true;
    }
    return false;
  }
  return inspect(error);
}

export async function reportRuntimeError(error: unknown, context: { module: string; action: string; requestId?: string; metadata?: Record<string, unknown> }) {
  if (error && typeof error === "object") {
    if (reported.has(error)) return;
    reported.add(error);
  }
  await writeLog({
    level: "ERROR", status: "FAILURE", module: context.module,
    action: isDatabaseUnavailable(error) ? "DATABASE_UNAVAILABLE" : context.action,
    message: isDatabaseUnavailable(error) ? "数据库连接不可用" : "服务器操作发生异常",
    requestId: context.requestId, metadata: { ...context.metadata, error: {
      name: error instanceof Error ? error.name : "UnknownError",
      code: errorCode(error) || undefined,
      digest: error && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : undefined,
    } },
  });
}
