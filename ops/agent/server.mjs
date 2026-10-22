import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { authorized } from "../alerting/notification.mjs";
import { AgentStore } from "./store.mjs";
import { analyzeTask, loadModelConfig } from "./analyze.mjs";
import { DailyStore } from "./daily-store.mjs";
import { collectDailySnapshot, createReportPool, dueDate } from "./daily-source.mjs";
import { summarizeDaily } from "./daily-summary.mjs";
import { dailyDeliveryTransport } from "./daily-delivery.mjs";
import { dailyKey } from "../alerting/daily-notification.mjs";

export function createAgentServer({ token, store, configured, dailyStore, dailyNotify = true, environment = "development", maxBytes = 16384 }) {
  const server = createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/health") {
      const health = store.health(configured);
      if (dailyStore) health.dailyOrders = dailyStore.health();
      reply(health.ok ? 200 : 503, health); return;
    }
    if (request.method !== "POST" || !["/tasks", "/daily-orders", "/daily-orders/notify"].includes(request.url)) { reply(404, { error: "NOT_FOUND" }); request.resume(); return; }
    if (!authorized(request.headers.authorization, token)) { reply(401, { error: "UNAUTHORIZED" }); request.resume(); return; }
    let size = 0; const chunks = [];
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) { reply(413, { error: "PAYLOAD_TOO_LARGE" }); request.resume(); return; }
        chunks.push(chunk);
      }
      let task;
      try { task = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
      catch { reply(400, { error: "INVALID_TASK" }); return; }
      if (request.url.startsWith("/daily-orders") && !dailyStore) { reply(503, { error: "DAILY_ORDERS_DISABLED" }); return; }
      if (request.url === "/daily-orders/notify" && !dailyNotify) { reply(503, { error: "DAILY_NOTIFY_DISABLED" }); return; }
      const result = request.url === "/daily-orders/notify" ? await dailyStore.queueNotification(task?.date, environment)
        : request.url === "/daily-orders" ? await dailyStore.enqueue(task?.date, { retry: task?.retry === true }) : await store.enqueue(task);
      reply(202, { status: result });
    } catch (error) {
      const invalid = ["INVALID_TASK", "EXPIRED_TASK", "INVALID_REPORT_DATE", "INVALID_DAILY_NOTICE", "DAILY_REPORT_NOT_READY"].includes(error.message);
      if (!response.headersSent) reply(invalid ? 400 : 503, { error: invalid ? "INVALID_TASK" : "TASK_NOT_STORED" });
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}

export async function main() {
  const token = (await readFile(process.env.AGENT_TOKEN_FILE ?? "/run/secrets/agent_webhook_token", "utf8")).trim();
  if (token.length < 32) throw new Error("INVALID_AGENT_TOKEN");
  const config = await loadModelConfig(process.env.AGENT_MODEL_FILE ?? "/run/secrets/agent_model");
  const store = await AgentStore.open(process.env.AGENT_STATE_FILE ?? "/var/lib/warehouse-agent/state.json");
  await store.update(() => {});
  const dailyEnabled = process.env.ORDER_DAILY_ENABLED === "true";
  const dailyAt = process.env.ORDER_DAILY_AT ?? "08:00";
  const dailyNotify = process.env.ORDER_DAILY_NOTIFY !== "false";
  const environment = process.env.ORDER_DAILY_ENVIRONMENT ?? "development";
  dailyKey(environment, "2026-01-01");
  const pool = dailyEnabled ? await createReportPool() : null;
  const dailyStore = dailyEnabled ? await DailyStore.open(process.env.ORDER_DAILY_STATE_FILE ?? "/var/lib/warehouse-agent/orders-daily.json") : null;
  if (dailyStore) { dueDate(Date.now(), dailyAt); await dailyStore.update(() => {}); }
  const server = createAgentServer({ token, store, configured: Boolean(config), dailyStore, dailyNotify, environment });
  server.listen(Number(process.env.AGENT_PORT ?? 8080), "0.0.0.0");
  const tick = () => config && store.processOne((task) => analyzeTask(task, config, store))
    .catch(() => console.error("AGENT_STORAGE_FAILURE"));
  const dailyTick = () => dailyStore && dailyStore.tick({ at: dailyAt, modelConfigured: Boolean(config), notify: dailyNotify, environment,
    collect: (date) => collectDailySnapshot(pool, date),
    summarize: (snapshot, previous) => summarizeDaily(snapshot, previous, token, config, store),
  }).catch(() => console.error("ORDER_DAILY_STORAGE_FAILURE"));
  const transport = dailyDeliveryTransport(token);
  const deliver = () => dailyNotify && dailyStore && dailyStore.deliverOne(transport).catch(() => console.error("ORDER_DAILY_NOTIFY_STORAGE_FAILURE"));
  const timer = setInterval(() => { void tick(); void dailyTick(); void deliver(); }, 1000); void tick(); void dailyTick(); void deliver();
  console.info(config ? "AGENT_STARTED" : "AGENT_MODEL_NOT_CONFIGURED");
  for (const event of ["SIGTERM", "SIGINT"]) process.once(event, () => {
    clearInterval(timer); server.close(); void pool?.end(); // Uncommitted jobs remain pending on restart.
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("AGENT_START_FAILED: check secret files and state volume"); process.exitCode = 1; });
}
