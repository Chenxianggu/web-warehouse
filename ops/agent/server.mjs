import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { authorized } from "../alerting/notification.mjs";
import { AgentStore } from "./store.mjs";
import { analyzeTask, loadModelConfig } from "./analyze.mjs";

export function createAgentServer({ token, store, configured, maxBytes = 16384 }) {
  const server = createServer(async (request, response) => {
    const reply = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(value));
    };
    if (request.method === "GET" && request.url === "/health") {
      const health = store.health(configured);
      reply(health.ok ? 200 : 503, health); return;
    }
    if (request.method !== "POST" || request.url !== "/tasks") { reply(404, { error: "NOT_FOUND" }); request.resume(); return; }
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
      const result = await store.enqueue(task);
      reply(202, { status: result });
    } catch (error) {
      const invalid = ["INVALID_TASK", "EXPIRED_TASK"].includes(error.message);
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
  const server = createAgentServer({ token, store, configured: Boolean(config) });
  server.listen(Number(process.env.AGENT_PORT ?? 8080), "0.0.0.0");
  const tick = () => config && store.processOne((task) => analyzeTask(task, config, store))
    .catch(() => console.error("AGENT_STORAGE_FAILURE"));
  const timer = setInterval(() => { void tick(); }, 1000); void tick();
  console.info(config ? "AGENT_STARTED" : "AGENT_MODEL_NOT_CONFIGURED");
  for (const event of ["SIGTERM", "SIGINT"]) process.once(event, () => {
    clearInterval(timer); server.close(); // Uncommitted jobs remain pending on restart.
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("AGENT_START_FAILED: check secret files and state volume"); process.exitCode = 1; });
}
