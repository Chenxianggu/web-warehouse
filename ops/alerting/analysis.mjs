import { digest } from "./notification.mjs";

export const RULES = ["数据库连接不可用", "认证日志保存失败", "后台请求异常增多", "业务写入连续异常", "数据库错误增多", "登录失败异常增多"];
export const MODULES = ["客户订单", "出库管理", "应收收款", "客户寄存", "采购到货", "整柜销售", "业务事务", "系统运行", "登录认证", "访问控制"];

// Only known production rules enter analysis. No annotations, raw log lines,
// actor names, business snapshots or arbitrary labels cross this boundary.
export function analysisTask(payload, now = Date.now()) {
  if (payload.status !== "firing") return null;
  const incidents = payload.alerts.filter((alert) => alert.status === "firing"
    && alert.labels?.application === "warehouse" && alert.labels.environment === "production"
    && RULES.includes(alert.labels.alertname) && !alert.labels.verification_id)
    .map((alert) => ({
      rule: alert.labels.alertname,
      module: MODULES.includes(alert.labels.module) ? alert.labels.module : null,
      startsAt: new Date(alert.startsAt).toISOString(),
      count: Number.isFinite(alert.values?.A) && alert.values.A >= 0 ? Math.min(alert.values.A, 1000000000) : null,
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (!incidents.length) return null;
  const key = digest(JSON.stringify(incidents.map(({ rule, module, startsAt }) => ({ rule, module, startsAt }))));
  return { version: 1, key, receivedAt: now, incidents };
}

export function validTask(task) {
  return task?.version === 1 && /^[a-f0-9]{64}$/.test(task.key) && Number.isSafeInteger(task.receivedAt) && task.receivedAt > 900000
    && Array.isArray(task.incidents) && task.incidents.length > 0 && task.incidents.length <= 50
    && task.incidents.every((item) => RULES.includes(item.rule) && (item.module === null || MODULES.includes(item.module))
      && typeof item.startsAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(item.startsAt)
      && Number.isFinite(Date.parse(item.startsAt))
      && (item.count === null || (Number.isFinite(item.count) && item.count >= 0 && item.count <= 1000000000)));
}

export async function forwardAnalysis(task, token, fetcher = fetch) {
  const response = await fetcher("http://agent:8080/tasks", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(task), signal: AbortSignal.timeout(5000), redirect: "error",
  });
  if (response.status !== 202) throw new Error("AGENT_NOT_STORED");
}
