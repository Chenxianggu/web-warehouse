// Explicit operator-only test. This one-off process needs Docker administrator
// access; never run it as a public endpoint or attach it to the normal notifier.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import { pathToFileURL } from "node:url";
import { setTimeout } from "node:timers/promises";

export function dockerLogText(buffer) {
  const chunks = [];
  for (let offset = 0; offset < buffer.length;) {
    if (buffer.length - offset < 8) throw new Error("INVALID_DOCKER_LOG_FRAME");
    const length = buffer.readUInt32BE(offset + 4);
    if (![1, 2].includes(buffer[offset]) || length > buffer.length - offset - 8) throw new Error("INVALID_DOCKER_LOG_FRAME");
    chunks.push(buffer.subarray(offset + 8, offset + 8 + length)); offset += 8 + length;
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function hasDelivery(logs, id, status) {
  return logs.split("\n").some((line) => {
    try { const item = JSON.parse(line); return item.event === "ALERT_DELIVERED" && item.verificationId === id && item.status === status; }
    catch { return false; }
  });
}

async function docker(path, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock", path, method,
      headers: body ? { "Content-Type": "application/json" } : {}, timeout: 10000 }, (res) => {
      const chunks = []; let size = 0;
      res.on("data", (chunk) => { size += chunk.length; if (size > 1048576) { res.destroy(new Error("DOCKER_RESPONSE_TOO_LARGE")); return; } chunks.push(chunk); });
      res.on("error", reject);
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(new Error(`Docker ${method} ${path}: HTTP ${res.statusCode}`)); return; }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on("timeout", () => req.destroy(new Error("DOCKER_API_TIMEOUT"))); req.on("error", reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

export async function main() {
  if (!process.argv.includes("--send")) {
    console.info("Production acceptance test: add --send to generate isolated production-labelled logs and send two real DingTalk notifications.");
    return;
  }
  const id = `prod-smoke-${randomBytes(6).toString("hex")}`;
  const since = Math.floor(Date.now() / 1000) - 1;
  const password = (await readFile(process.env.GRAFANA_PASSWORD_FILE ?? "/run/secrets/grafana_admin_password", "utf8")).trim();
  const headers = { Authorization: `Basic ${Buffer.from(`developer:${password}`).toString("base64")}`, "Content-Type": "application/json" };
  async function api(path, method = "GET", body) {
    const response = await fetch(`http://127.0.0.1:3300${path}`, { method, headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Grafana ${method} ${path}: HTTP ${response.status}`);
    const text = await response.text(); return text ? JSON.parse(text) : null;
  }
  async function delivery(status) {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      const raw = await docker(`/containers/warehouse-ops-notifier-1/logs?stdout=1&stderr=1&since=${since}&tail=200`);
      if (hasDelivery(dockerLogText(raw), id, status)) {
        console.info(JSON.stringify({ event: "PRODUCTION_SMOKE_DELIVERED", verificationId: id, status })); return;
      }
      await setTimeout(2000);
    }
    throw new Error(`No confirmed DingTalk delivery for ${status} within 180 seconds`);
  }
  const health = await fetch("http://127.0.0.1:3310/health", { signal: AbortSignal.timeout(5000) });
  assert.equal(health.status, 200, "real notifier must be configured and healthy");
  const config = JSON.parse(await readFile(new URL("../grafana/provisioning/alerting/warehouse.json", import.meta.url), "utf8"));
  const source = structuredClone(config.groups[0].rules.find((rule) => rule.uid === "warehouse-business-burst"));
  assert.ok(source, "production business-error rule must exist");
  source.data[0].model.expr = `sum(count_over_time({application="warehouse",environment="production",service_name="alert-smoke"} | json | __error__="" | action="PRODUCTION_ALERT_TEST" | verification_id="${id}" [30s])) or vector(0)`;
  let folder = false; let rule = false; let container = false;
  console.info(JSON.stringify({ event: "PRODUCTION_SMOKE_STARTED", verificationId: id, note: "isolated test; no business or database failure" }));
  try {
    await api("/api/folders", "POST", { uid: id, title: `生产验收测试 · ${id}` }); folder = true;
    const body = { ...source, uid: id, title: `生产验收测试 · 模拟业务异常 · ${id}`, folderUID: id, ruleGroup: id, orgID: 1,
      labels: { application: "warehouse", environment: "production", severity: "info", verification_id: id },
      annotations: { summary: "生产报警链路验收测试：模拟日志，不代表真实业务故障", description: "本测试未停止业务或数据库；停止测试日志后会自动发送恢复通知。" },
      notification_settings: { receiver: "warehouse-mobile", group_by: ["alertname", "grafana_folder"], group_wait: "5s", group_interval: "5s", repeat_interval: "1h" } };
    await api("/api/v1/provisioning/alert-rules", "POST", body); rule = true;
    await api(`/api/v1/provisioning/folder/${id}/rule-groups/${id}`, "PUT", { title: id, folderUid: id, interval: 10, rules: [body] });
    const line = JSON.stringify({ level: "ERROR", action: "PRODUCTION_ALERT_TEST", module: "生产验收测试", verification_id: id, message: "模拟异常，不代表真实业务故障" });
    await docker(`/containers/create?name=${id}`, "POST", { Image: "postgres:17-alpine", Entrypoint: ["sh"],
      Cmd: ["-c", `while true; do printf '%s\\n' '${line}'; sleep 2; done`],
      Labels: { "io.renzhong.logs": "true", "io.renzhong.environment": "production", "com.docker.compose.service": "alert-smoke" },
      HostConfig: { NetworkMode: "none", ReadonlyRootfs: true, CapDrop: ["ALL"], SecurityOpt: ["no-new-privileges:true"], Memory: 67108864,
        LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "1" } } } }); container = true;
    await docker(`/containers/${id}/start`, "POST");
    await delivery("firing");
    await docker(`/containers/${id}/stop?t=1`, "POST");
    console.info("Stopped only the isolated log generator; waiting for automatic recovery.");
    await delivery("resolved");
    console.info("Production acceptance passed: log → Alloy → Loki → Grafana → authenticated notifier → DingTalk accepted firing and recovery.");
  } finally {
    const errors = [];
    for (const [created, path] of [[rule, `/api/v1/provisioning/alert-rules/${id}`], [folder, `/api/folders/${id}`]]) {
      if (created) try { await api(path, "DELETE"); } catch { errors.push(path); }
    }
    if (container) try { await docker(`/containers/${id}?force=1`, "DELETE"); } catch { errors.push(id); }
    if (errors.length) throw new Error(`Test resources need cleanup: ${errors.join(", ")}`);
    console.info(JSON.stringify({ event: "PRODUCTION_SMOKE_CLEANED_UP", verificationId: id }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
