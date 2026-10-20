import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

const clean = (value, limit = 300) => String(value ?? "").replace(/[\r\n\t]/g, " ").slice(0, limit);
export const digest = (value) => createHash("sha256").update(value).digest("hex");

export function authorized(actual, token) {
  const expected = Buffer.from(`Bearer ${token}`);
  const received = Buffer.from(actual ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

// Only rule-owned summaries reach mobile. Never forward log lines, snapshots,
// request bodies, actor names, SQL, webhook URLs or arbitrary metadata.
export function grafanaNotice(payload) {
  if (!payload || !["firing", "resolved"].includes(payload.status) || !Array.isArray(payload.alerts) || !payload.alerts.length || payload.alerts.length > 50) {
    throw new Error("INVALID_NOTIFICATION");
  }
  const identities = [];
  const lines = [payload.status === "resolved" ? "✅ 任仲塑料后台报警恢复" : "🚨 任仲塑料后台报警"];
  for (const alert of payload.alerts) {
    if (!alert || !["firing", "resolved"].includes(alert.status) || typeof alert.labels?.alertname !== "string") throw new Error("INVALID_NOTIFICATION");
    identities.push([alert.fingerprint ?? alert.labels.alertname, alert.status, alert.startsAt ?? "", alert.status === "resolved" ? alert.endsAt ?? "" : ""]);
    lines.push(
      `${alert.status === "resolved" ? "恢复" : "异常"}：${clean(alert.labels.alertname)}`,
      `环境：${clean(alert.labels.environment ?? "production", 30)} · 等级：${clean(alert.labels.severity ?? "warning", 30)}`,
      ...(alert.labels.module ? [`模块：${clean(alert.labels.module, 64)}`] : []),
      ...(Number.isFinite(alert.values?.A) ? [`窗口内次数：${alert.values.A}`] : []),
      `说明：${clean(alert.annotations?.summary)}`,
      `排查：${clean(alert.annotations?.description, 400)}`,
      `首次发生：${clean(alert.startsAt, 40)}`,
      ...(alert.status === "resolved" ? [`结束时间：${clean(alert.endsAt, 40)}`] : []),
    );
  }
  if (payload.truncatedAlerts > 0) lines.push(`另有 ${Number(payload.truncatedAlerts)} 条，请查看 Grafana。`);
  lines.push("详情请通过 SSH 隧道打开 Grafana → 任仲塑料后台 · 运行排错。窗口报警恢复仅表示当前阈值已解除。");
  return {
    key: digest(JSON.stringify([payload.groupKey ?? "", identities.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))])),
    text: lines.join("\n").slice(0, 6000),
    status: payload.status,
    verificationId: payload.alerts.every((alert) => alert.labels.verification_id === payload.alerts[0].labels.verification_id)
      && /^prod-smoke-[a-f0-9]{12}$/.test(payload.alerts[0].labels.verification_id ?? "")
      ? payload.alerts[0].labels.verification_id : null,
  };
}

export async function loadChannel(path) {
  const config = JSON.parse(await readFile(path, "utf8"));
  if (config.channel === "unconfigured") return null;
  if (config.channel !== "dingtalk" || typeof config.webhook !== "string" || typeof config.secret !== "string" || !config.secret.trim()) throw new Error("INVALID_CHANNEL_CONFIG");
  const url = new URL(config.webhook);
  if (url.protocol !== "https:" || url.hostname !== "oapi.dingtalk.com" || url.pathname !== "/robot/send" || !url.searchParams.get("access_token") || url.username || url.password || url.port) throw new Error("INVALID_DINGTALK_URL");
  return config;
}

export function dingTalkRequest(config, text, now = Date.now()) {
  const url = new URL(config.webhook);
  const timestamp = String(now);
  const sign = createHmac("sha256", config.secret).update(`${timestamp}\n${config.secret}`).digest("base64");
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);
  return { url, body: { msgtype: "text", text: { content: text }, at: { isAtAll: false } } };
}

export async function sendDingTalk(config, text, fetcher = fetch) {
  const request = dingTalkRequest(config, text);
  const response = await fetcher(request.url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request.body), signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new Error("CHANNEL_HTTP_FAILURE");
  const result = await response.json();
  // DingTalk can return HTTP 200 for signature/rate-limit failures.
  if (result.errcode !== 0) throw new Error("CHANNEL_REJECTED");
}
