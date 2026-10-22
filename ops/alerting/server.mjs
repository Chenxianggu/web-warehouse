import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { authorized, grafanaNotice, loadChannel, sendDingTalk } from "./notification.mjs";
import { Outbox } from "./outbox.mjs";
import { analysisTask, forwardAnalysis } from "./analysis.mjs";
import { dailyKey, dailyNotice } from "./daily-notification.mjs";

export function createAlertServer({ token, agentToken, outbox, configured, analysisEnabled = false, maxBytes = 65536 }) {
  return createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/health") {
      const health = outbox.health(configured);
      reply(health.ok ? 200 : 503, health); return;
    }
    const dailyStatus = request.method === "GET" && request.url.match(/^\/order-daily\/(development|production|testing)\/(\d{4}-\d{2}-\d{2})$/);
    const dailyPost = request.method === "POST" && request.url === "/order-daily";
    if (!dailyStatus && !dailyPost && (request.method !== "POST" || request.url !== "/grafana")) { reply(404, { error: "NOT_FOUND" }); request.resume(); return; }
    const credential = dailyStatus || dailyPost ? agentToken : token;
    if (!credential || !authorized(request.headers.authorization, credential)) { reply(401, { error: "UNAUTHORIZED" }); request.resume(); return; }
    if (dailyStatus) {
      try { reply(200, outbox.dailyStatus(dailyKey(dailyStatus[1], dailyStatus[2]))); }
      catch { reply(400, { error: "INVALID_REPORT_DATE" }); }
      return;
    }
    let size = 0; const chunks = [];
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBytes) { reply(413, { error: "PAYLOAD_TOO_LARGE" }); return; }
        chunks.push(chunk);
      }
      let notice; let task = null;
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        notice = dailyPost ? dailyNotice(payload) : grafanaNotice(payload);
        // A malformed AI context may not suppress an otherwise valid alarm.
        if (!dailyPost && analysisEnabled) { try { task = analysisTask(payload); } catch { console.error("AGENT_CONTEXT_INVALID"); } }
      }
      catch { reply(400, { error: "INVALID_NOTIFICATION" }); return; }
      const result = await outbox.enqueue(notice, undefined, task);
      reply(202, { status: result }); // Only acknowledge after durable storage.
    } catch {
      if (!response.headersSent) reply(503, { error: "NOTIFICATION_NOT_STORED" });
    }
  });
}

export async function main() {
  const token = (await readFile(process.env.ALERT_TOKEN_FILE ?? "/run/secrets/alert_webhook_token", "utf8")).trim();
  if (token.length < 32) throw new Error("INVALID_WEBHOOK_TOKEN");
  const config = await loadChannel(process.env.ALERT_CHANNEL_FILE ?? "/run/secrets/alert_channel");
  const outbox = await Outbox.open(process.env.ALERT_STATE_FILE ?? "/var/lib/warehouse-alerts/outbox.json");
  const analysisEnabled = process.env.LOG_AGENT_ENABLED === "true";
  const agentToken = (await readFile(process.env.AGENT_TOKEN_FILE ?? "/run/secrets/agent_webhook_token", "utf8")).trim();
  if (agentToken.length < 32) throw new Error("INVALID_AGENT_TOKEN");
  // Check state storage at startup, before serving or acknowledging webhooks.
  await outbox.enqueue(null);
  const server = createAlertServer({ token, agentToken, outbox, configured: Boolean(config), analysisEnabled });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.listen(Number(process.env.ALERT_PORT ?? 8080), "0.0.0.0");
  const tick = () => config && outbox.processOne((text) => sendDingTalk(config, text)).catch(() => console.error("ALERT_STORAGE_FAILURE"));
  const forward = () => analysisEnabled && outbox.forwardOne((task) => forwardAnalysis(task, agentToken)).catch(() => console.error("AGENT_FORWARD_STORAGE_FAILURE"));
  const timer = setInterval(() => { void tick(); void forward(); }, 1000); void tick(); void forward();
  console.info(config ? "ALERT_SERVICE_STARTED" : "ALERT_CHANNEL_NOT_CONFIGURED");
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
    clearInterval(timer); server.close(); // Docker stop grace allows current writes/delivery to finish.
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("ALERT_SERVICE_START_FAILED: check secret files and state volume"); process.exitCode = 1; });
}
