export const DAILY_ENVIRONMENTS = { development: "本地开发环境", production: "生产环境", testing: "测试环境" };

export function dailyKey(environment, date) {
  if (!Object.hasOwn(DAILY_ENVIRONMENTS, environment) || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("INVALID_DAILY_NOTICE");
  return `order-daily:${environment}:${date}`;
}

// This endpoint is authenticated with the separate agent credential. Only
// bounded, locally rendered report text is accepted; it never calls the model.
export function dailyNotice(payload) {
  const key = dailyKey(payload?.environment, payload?.date);
  if (payload.version !== 1 || typeof payload.text !== "string" || !payload.text.startsWith("任仲塑料后台 · 客户订单日报\n")
    || Buffer.byteLength(payload.text, "utf8") > 12000 || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(payload.text)) throw new Error("INVALID_DAILY_NOTICE");
  return { key, kind: "order-daily", reportDate: payload.date, text: payload.text };
}

export async function submitDailyNotice(payload, token, { fetcher = fetch, baseUrl = "http://notifier:8080" } = {}) {
  dailyNotice(payload);
  const response = await fetcher(`${baseUrl}/order-daily`, { method: "POST", redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  if (response.status !== 202) throw new Error("DAILY_NOTIFY_NOT_STORED");
}

export async function dailyNoticeStatus(environment, date, token, { fetcher = fetch, baseUrl = "http://notifier:8080" } = {}) {
  dailyKey(environment, date);
  const response = await fetcher(`${baseUrl}/order-daily/${environment}/${date}`, { redirect: "error",
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("DAILY_NOTIFY_STATUS_UNAVAILABLE");
  const result = await response.json();
  if (!["missing", "queued", "delivered"].includes(result.status)
    || (result.status === "delivered" && !Number.isFinite(result.deliveredAt))) throw new Error("INVALID_DAILY_NOTIFY_STATUS");
  return result;
}
