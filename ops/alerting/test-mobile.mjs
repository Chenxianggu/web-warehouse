import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

// An explicit operator command: enqueue firing and resolved through the real
// local receiver. Credentials remain in files and are never printed.
if (!process.argv.includes("--send")) {
  console.info("This command sends two real DingTalk messages. Run npm run alerts:test -- --send after configuring the channel.");
  process.exit(0);
}
const port = Number(process.env.ALERT_PORT ?? 3310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("INVALID_ALERT_PORT");
const base = `http://127.0.0.1:${port}`;
try {
  const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5000) });
  if (!health.ok) throw new Error("NOTIFIER_NOT_READY");
  const token = (await readFile(new URL("../.secrets/alert_webhook_token", import.meta.url), "utf8")).trim();
  const id = `mobile-test-${randomUUID()}`; const startsAt = new Date().toISOString();
  for (const status of ["firing", "resolved"]) {
    const response = await fetch(`${base}/grafana`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000), body: JSON.stringify({
      status, groupKey: id, alerts: [{ status, fingerprint: id, startsAt, endsAt: status === "resolved" ? new Date().toISOString() : "",
        labels: { alertname: "手机报警验收测试", environment: "test", severity: "info" },
        annotations: { summary: "这是人工试发，不代表生产故障", description: "请在手机确认收到报警和恢复两条通知" } }],
    }) });
    if (response.status !== 202) throw new Error("TEST_NOT_STORED");
  }
  console.info("Two test notifications stored. Check notifier delivery logs AND confirm both messages on your phone; queued does not mean delivered.");
} catch { console.error("Mobile test failed. Check notifier health, secret file and port; no credentials were printed."); process.exitCode = 1; }
