import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// Temporary rule, folder and receiver. The isolated sink has no mobile secret.
// No production rules/policies or business data are modified.
const id = `verify-${randomBytes(6).toString("hex")}`;
const port = Number(process.env.GRAFANA_PORT ?? 3300);
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const password = (await readFile(new URL("../ops/.secrets/grafana_admin_password", import.meta.url), "utf8")).trim();
const token = (await readFile(new URL("../ops/.secrets/alert_webhook_token", import.meta.url), "utf8")).trim();
const base = `http://127.0.0.1:${port}`;
const headers = { Authorization: `Basic ${Buffer.from(`developer:${password}`).toString("base64")}`, "Content-Type": "application/json" };
async function api(path, method = "GET", body) {
  const response = await fetch(base + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `Grafana ${method} ${path}: HTTP ${response.status}`);
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
const compose = (...args) => execFileSync("docker", ["compose", "-f", "docker-compose.ops.yml", "--profile", "verification", ...args], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
async function eventually(check, label) {
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`${label} not observed within 120 seconds`);
}

let folder = false; let receiver = false; let rule = false;
try {
  compose("run", "--rm", "-T", "--no-deps", "alert-persistence-check", "seed", id);
  compose("run", "--rm", "-T", "--no-deps", "alert-persistence-check", "resume", id);
  console.info("Persisted failure survived container replacement and resumed delivery in a network-disabled fixture.");
  const provisioned = await api("/api/v1/provisioning/alert-rules");
  const expected = JSON.parse(await readFile(new URL("../ops/grafana/provisioning/alerting/warehouse.json", import.meta.url), "utf8"));
  for (const source of expected.groups[0].rules) {
    const actual = provisioned.find((item) => item.uid === source.uid);
    assert.ok(actual, `${source.uid} must be provisioned`);
    assert.equal(actual.notification_settings?.receiver, "warehouse-mobile");
    const query = await api("/api/ds/query", "POST", {
      from: String(Date.now() - 300000), to: String(Date.now()),
      queries: [{ ...source.data[0].model, datasource: { type: "loki", uid: "warehouse-loki" } }],
    });
    assert.ok(!query.results?.A?.error, `${source.uid} LogQL must evaluate`);
  }
  // Explicit fixture startup, independent of the real notifier.
  compose("up", "-d", "--force-recreate", "alert-test-sink");
  await eventually(async () => {
    try { return compose("exec", "-T", "alert-test-sink", "node", "-e", "fetch('http://127.0.0.1:8080/health').then(r=>process.stdout.write(String(r.status)))").trim() === "200"; }
    catch { return false; }
  }, "isolated notification sink readiness");
  await api("/api/folders", "POST", { uid: id, title: id }); folder = true;
  await api("/api/v1/provisioning/contact-points", "POST", {
    uid: id, name: id, type: "webhook", disableResolveMessage: false,
    settings: { url: "http://alert-test-sink:8080/grafana", httpMethod: "POST", authorization_scheme: "Bearer", authorization_credentials: token },
  }); receiver = true;
  const source = structuredClone(expected.groups[0].rules[0]);
  source.data[0].model.expr = `sum(count_over_time({application="warehouse",environment="test"} |= "${id}" [30s])) or vector(0)`;
  const body = { ...source, uid: id, title: id, folderUID: id, ruleGroup: id, orgID: 1, labels: { environment: "test", severity: "warning" },
    annotations: { summary: "隔离报警链路测试", description: "不发送手机" },
    notification_settings: { receiver: id, group_by: ["alertname", "grafana_folder"], group_wait: "0s", group_interval: "1s", repeat_interval: "1h" } };
  await api("/api/v1/provisioning/alert-rules", "POST", body); rule = true;
  await api(`/api/v1/provisioning/folder/${id}/rule-groups/${id}`, "PUT", { title: id, folderUid: id, interval: 10, rules: [body] });
  // Keep the condition true until delivery is observed. A single log can age
  // out of a short test window while collector/Alertmanager discovery catches up.
  const line = JSON.stringify({ level: "ERROR", message: id });
  execFileSync("docker", ["run", "--detach", "--name", id, "--label", "io.renzhong.logs=true", "--label", "io.renzhong.environment=test", "--label", "com.docker.compose.service=app", "--entrypoint", "sh", "postgres:17-alpine", "-c", `while true; do printf '%s\\n' '${line}'; sleep 2; done`], { timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  const received = () => {
    const state = JSON.parse(compose("exec", "-T", "alert-test-sink", "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/tmp/alert-test-outbox.json','utf8'))"));
    return state.pending.filter((item) => item.text.includes(id));
  };
  await eventually(async () => received().some((item) => item.text.startsWith("🚨")), "Loki → Grafana firing → authenticated receiver → durable outbox");
  console.info("Firing notification persisted; stopping the log source to verify recovery.");
  execFileSync("docker", ["stop", "--time", "1", id], { timeout: 15000, stdio: ["ignore", "pipe", "pipe"] });
  await eventually(async () => received().some((item) => item.text.startsWith("✅")), "Loki window expiry → Grafana resolved → durable outbox");
  console.info("All production rules provisioned and evaluated; isolated firing and resolved notifications persisted. No mobile messages sent.");
} finally {
  const cleanupErrors = [];
  for (const [created, path] of [[rule, `/api/v1/provisioning/alert-rules/${id}`], [receiver, `/api/v1/provisioning/contact-points/${id}`], [folder, `/api/folders/${id}`]]) {
    if (created) try { await api(path, "DELETE"); } catch { cleanupErrors.push(path); }
  }
  try { execFileSync("docker", ["rm", "--force", id], { stdio: "ignore" }); } catch { /* fixture may not have started */ }
  try { compose("rm", "--stop", "--force", "alert-test-sink"); } catch { cleanupErrors.push("alert-test-sink"); }
  try { compose("run", "--rm", "-T", "--no-deps", "alert-persistence-check", "cleanup", id); } catch { cleanupErrors.push("alert-persistence-check state"); }
  assert.deepEqual(cleanupErrors, [], "temporary verification resources must be cleaned up");
}
