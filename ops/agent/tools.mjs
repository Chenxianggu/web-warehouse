import { createHash } from "node:crypto";
import { MODULES } from "../alerting/analysis.mjs";
import { boundedJson } from "./http.mjs";

const ACTIONS = ["DATABASE_UNAVAILABLE", "LOG_STORAGE_FAILED", "REQUEST_ERROR", "BUSINESS_WRITE_FAILED", "LOGIN_FAILED", "LOGIN", "LOGOUT", "ACCESS_DENIED"];
const ERROR_NAMES = ["Error", "TypeError", "RangeError", "PrismaClientKnownRequestError", "PrismaClientUnknownRequestError", "PrismaClientInitializationError", "PrismaClientValidationError", "UnknownError"];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ERROR_CODE = /^(?:P\d{4}|[0-9][0-9A-Z]{4}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)$/;
const RUNBOOK = {
  database: "数据库连接异常：先检查数据库存活、连接数和最近发布；P1001/ECONNREFUSED 表示连接失败线索，不能据此认定数据库进程已停止。Agent 没有主机指标或容器控制权限。",
  application: "请求/业务写入异常：按关联编号查看事件顺序，比较模块、错误码和发布版本。当前没有完整堆栈与源码定位信息；正常校验失败不计入运行报警。",
  authentication: "登录失败增加：检查失败次数与持续时间；当前不提供账号、IP 或请求正文，无法确认攻击来源、受影响账号或是否凭据泄露。",
  observability: "日志落库失败：标准输出仍由 Alloy/Loki 采集。窗口报警恢复只说明阈值解除，不证明根因消除。日志缺失也不证明服务正常。",
};

export function projectLog(line, stream, timestamp) {
  if (!["app", "db"].includes(stream.service_name) || stream.environment !== "production" || stream.application !== "warehouse"
    || typeof timestamp !== "string" || !/^\d{16,20}$/.test(timestamp)) return null;
  const time = Number(BigInt(timestamp) / 1000000n);
  if (!Number.isFinite(time) || time < 0 || time > 8640000000000000) return null;
  const record = { timestamp: new Date(time).toISOString(), service: stream.service_name };
  if (stream.service_name === "db") {
    const severity = /\b(ERROR|FATAL|PANIC|WARNING):/.exec(line)?.[1];
    if (!severity) return null;
    // Never forward SQL, parameters, usernames or the free-form database message.
    return { ...record, level: severity === "WARNING" ? "WARN" : "ERROR", kind: "DATABASE_LOG", detail: "数据库原始文本已省略" };
  }
  let parsed;
  try { parsed = JSON.parse(line); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || !ACTIONS.includes(parsed.action)) return null;
  const error = parsed.metadata?.error;
  return { ...record,
    level: ["INFO", "WARN", "ERROR"].includes(parsed.level) ? parsed.level : "UNKNOWN",
    action: parsed.action, module: MODULES.includes(parsed.module) ? parsed.module : "其他模块",
    ...(typeof parsed.requestId === "string" && UUID.test(parsed.requestId) ? { requestId: parsed.requestId } : {}),
    ...(typeof parsed.release === "string" && /^(?:v?\d+\.\d+\.\d+(?:[-.][a-z0-9]+)*|[a-f0-9]{7,40}|development)$/.test(parsed.release) ? { release: parsed.release } : {}),
    error: {
      ...(ERROR_NAMES.includes(error?.name) ? { name: error.name } : {}),
      ...(typeof error?.code === "string" && ERROR_CODE.test(error.code) ? { code: error.code } : {}),
      ...(typeof error?.digest === "string" && /^\d{1,32}$/.test(error.digest) ? { digest: error.digest } : {}),
    },
  };
}

const fn = (name, description, properties) => ({ type: "function", name, description,
  parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false } });
export const TOOLS = [
  fn("query_logs", "查询报警前15分钟内的生产运行日志；只能选服务，不能输入 SQL 或 LogQL。返回的是有限样本。", { service: { type: "string", enum: ["app", "db"] } }),
  fn("related_request", "按已经出现在证据中的关联编号查询同一时间窗内的事件。", { requestId: { type: "string" } }),
  fn("read_runbook", "读取固定排障说明。", { topic: { type: "string", enum: Object.keys(RUNBOOK) } }),
];

export function createTools(task, { fetcher = fetch, lokiUrl = "http://loki:3100", signal } = {}) {
  const evidence = new Map(); const queries = []; const cache = new Map();
  const start = task.receivedAt - 15 * 60000; const end = task.receivedAt;
  let calls = 0;
  async function query(service, requestId = null) {
    const expression = `{application="warehouse",environment="production",service_name=${JSON.stringify(service)}}`
      + (requestId ? ` | json | __error__="" | requestId=${JSON.stringify(requestId)}` : ' | level=~"ERROR|WARN"');
    const url = new URL("/loki/api/v1/query_range", lokiUrl);
    url.search = new URLSearchParams({ query: expression, start: `${start}000000`, end: `${end}000000`, limit: "80", direction: "backward" }).toString();
    const result = await boundedJson(await fetcher(url, { method: "GET", redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) }));
    if (result.status !== "success" || result.data?.resultType !== "streams" || !Array.isArray(result.data.result)) throw new Error("INVALID_LOKI_RESPONSE");
    const records = [];
    for (const stream of result.data.result) {
      if (!stream.stream || !Array.isArray(stream.values)) throw new Error("INVALID_LOKI_RESPONSE");
      if (stream.stream.service_name !== service) continue;
      for (const value of stream.values) {
        if (!Array.isArray(value) || typeof value[1] !== "string") continue;
        const record = projectLog(value[1], stream.stream, value[0]);
        if (!record || Date.parse(record.timestamp) < start || Date.parse(record.timestamp) > end || (requestId && record.requestId !== requestId)) continue;
        const id = `E-${createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 16)}`;
        evidence.set(id, { id, ...record }); records.push(evidence.get(id));
        if (records.length >= 80) break;
      }
      if (records.length >= 80) break;
    }
    queries.push({ expression, start: new Date(start).toISOString(), end: new Date(end).toISOString(), limit: 80, returned: records.length });
    return { records, sampleOnly: true, note: "最多80条脱敏样本；不能据此推算完整错误总数，未返回也不证明没有异常。" };
  }
  async function execute(name, args) {
    if (++calls > 6) throw new Error("TOOL_LIMIT");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("INVALID_TOOL_ARGUMENTS");
    const key = JSON.stringify([name, args]);
    if (cache.has(key)) return cache.get(key);
    let value;
    if (name === "query_logs" && Object.keys(args).length === 1 && ["app", "db"].includes(args.service)) value = await query(args.service);
    else if (name === "related_request" && Object.keys(args).length === 1 && UUID.test(args.requestId)
      && [...evidence.values()].some((item) => item.requestId === args.requestId)) value = await query("app", args.requestId);
    else if (name === "read_runbook" && Object.keys(args).length === 1 && Object.hasOwn(RUNBOOK, args.topic)) value = { text: RUNBOOK[args.topic] };
    else throw new Error("TOOL_NOT_ALLOWED");
    cache.set(key, value);
    return value;
  }
  return { execute, evidence, queries };
}
