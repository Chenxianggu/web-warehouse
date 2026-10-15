const sensitiveKey = /password|passwd|pwd|secret|token|cookie|authorization|credential|session|database.?url|connection.?string/i;

export function redactText(value: string): string {
  return value
    .replace(/\b(?:postgres(?:ql)?|mysql|redis):\/\/[^\s"'<>]+/gi, "[已隐藏连接地址]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [已隐藏]")
    .replace(/((?:password|passwd|pwd|secret|token|authorization|cookie)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[已隐藏]")
    .slice(0, 4000);
}

/** Bounded JSON, no request bodies, cookies, tokens or password hashes. */
export function sanitizeLogData(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[内容过深]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    // Database errors can embed complete query arguments, including passwords.
    return { name: value.name, ...("code" in value ? { code: redactText(String(value.code)) } : {}), ...("digest" in value ? { digest: redactText(String(value.digest)) } : {}) };
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeLogData(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) => [key, sensitiveKey.test(key) ? "[已隐藏]" : sanitizeLogData(item, depth + 1)]));
  return String(value);
}
