import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// This talks only to loopback, creates a disposable container, and never changes business data.
const port = Number(process.env.GRAFANA_PORT ?? 3300);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535, "invalid GRAFANA_PORT");
const base = `http://127.0.0.1:${port}`;
const password = (await readFile(new URL("../ops/.secrets/grafana_admin_password", import.meta.url), "utf8")).trim();
const headers = { Authorization: `Basic ${Buffer.from(`developer:${password}`).toString("base64")}`, "Content-Type": "application/json" };
async function api(path, body) {
  const response = await fetch(base + path, { headers, ...(body ? { method: "POST", body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}
async function sql(rawSql) {
  return api("/api/ds/query", { from: String(Date.now() - 86400000), to: String(Date.now()), queries: [{ refId: "A", datasource: { type: "grafana-postgresql-datasource", uid: "warehouse-audit" }, rawSql, format: "table", rawQuery: true, editorMode: "code" }] });
}

const health = await api("/api/health");
assert.equal(health.status, 200);
const anonymous = await fetch(base + "/api/search", { redirect: "manual" });
assert.equal(anonymous.status, 401, "anonymous users must not read dashboards");
for (const uid of ["warehouse-runtime", "warehouse-audit"]) {
  const dashboard = await api(`/api/dashboards/uid/${uid}`);
  assert.equal(dashboard.status, 200, `dashboard ${uid} provisioned`);
  assert.ok(dashboard.body.dashboard.panels.length > 0);
  if (uid === "warehouse-audit") {
    const variables = new Map(dashboard.body.dashboard.templating.list.map((variable) => [variable.name, variable]));
    // Grafana intentionally inserts custom All values verbatim, bypassing :sqlstring.
    for (const panel of dashboard.body.dashboard.panels) {
      for (const target of panel.targets) {
        const query = target.rawSql.replace(/\$\{(\w+):sqlstring\}/g, (_, name) => variables.get(name).allValue ?? "''");
        const result = await sql(query);
        assert.equal(result.status, 200, `audit panel ${panel.id} must query with default dashboard filters`);
        assert.ok(!result.body.results.A.error);
      }
    }
  }
}
const auditHealth = await api("/api/datasources/uid/warehouse-audit/health");
assert.equal(auditHealth.body.status, "OK", "audit reader must connect to the database");
const view = await sql("SELECT id::text, created_at, actor_name, before_json, after_json FROM observability.events ORDER BY id DESC LIMIT 1");
assert.equal(view.status, 200);
assert.ok(!view.body.results.A.error, "the audit view must be readable");
for (const statement of ["SELECT id FROM public.users LIMIT 0", "SELECT id FROM public.system_logs LIMIT 0", "DELETE FROM observability.events WHERE false RETURNING id"]) {
  const denied = await sql(statement);
  assert.ok(denied.status >= 400 || denied.body.results?.A?.error, "the Grafana reader must not access business tables or write audit data");
}
console.info("Grafana authentication, both dashboards, audit queries and read-only isolation passed.");

const marker = `ops-verify-${randomUUID()}`;
const run = (args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
async function waitForLog(service = "app", level = "ERROR") {
  const query = `{application="warehouse",environment="test",service_name="${service}",level="${level}"} |= "${marker}"`;
  const path = "/api/datasources/proxy/uid/warehouse-loki/loki/api/v1/query_range?" + new URLSearchParams({ query, start: String(BigInt(Date.now() - 60000) * BigInt(1000000)), limit: "10" });
  const until = Date.now() + 55000;
  while (Date.now() < until) {
    try {
      const result = await api(path);
      if (result.status === 200 && result.body.data?.result?.some((stream) => stream.values.some(([, line]) => line.includes(marker)))) return;
    } catch { /* retry startup and collector discovery */ }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Docker → Alloy → Loki → Grafana did not deliver the test log within 55 seconds");
}
try {
  const line = JSON.stringify({ level: "ERROR", category: "SYSTEM", message: marker });
  run(["run", "--detach", "--name", marker, "--label", "io.renzhong.logs=true", "--label", "io.renzhong.environment=test", "--label", "com.docker.compose.service=app", "--entrypoint", "sh", "postgres:17-alpine", "-c", `printf '%s\n' '${line}'; sleep 120`]);
  await waitForLog();
  console.info("Docker → read-only proxy → Alloy → Loki → Grafana delivered the structured error log.");
  run(["run", "--detach", "--name", `${marker}-db`, "--label", "io.renzhong.logs=true", "--label", "io.renzhong.environment=test", "--label", "com.docker.compose.service=db", "--entrypoint", "sh", "postgres:17-alpine", "-c", `printf '%s\n' '2026-10-15 00:00:00 UTC [1] WARNING: ${marker}'; sleep 120`]);
  await waitForLog("db", "WARN");
  console.info("PostgreSQL text severity was normalized and is searchable through the level filter.");
  if (process.argv.includes("--restart-loki")) {
    run(["compose", "-f", "docker-compose.ops.yml", "restart", "loki"]);
    await waitForLog();
    console.info("Log remained queryable after restarting Loki (persistent storage/WAL).");
  }
} finally {
  for (const name of [marker, `${marker}-db`]) {
    try { run(["rm", "--force", name]); } catch { /* second fixture might not have started */ }
  }
}
