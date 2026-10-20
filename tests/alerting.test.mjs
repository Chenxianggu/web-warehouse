import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { authorized, grafanaNotice, dingTalkRequest, sendDingTalk, loadChannel } from "../ops/alerting/notification.mjs";
import { Outbox } from "../ops/alerting/outbox.mjs";
import { createAlertServer } from "../ops/alerting/server.mjs";
import { monitorOnce, probe, transition } from "../ops/alerting/monitor.mjs";
import { dockerLogText, hasDelivery } from "../ops/alerting/production-smoke.mjs";

const config = { channel: "dingtalk", webhook: "https://oapi.dingtalk.com/robot/send?access_token=test-secret", secret: "SEC-test-signing-key" };
const payload = (status = "firing") => ({
  status, groupKey: "test-group", alerts: [{ status, fingerprint: "rule-1", startsAt: "2026-10-20T00:00:00Z", endsAt: status === "resolved" ? "2026-10-20T00:05:00Z" : "",
    labels: { alertname: "订单连续异常", environment: "production", severity: "warning", module: "客户订单", actorName: "private-customer" },
    annotations: { summary: "最近 5 分钟异常达到 3 次", description: "检查数据库连接", log: "private-sql" }, values: { A: 3 }, metadata: { token: "private-token" } }],
});
async function temp(t) {
  const directory = await mkdtemp(join(tmpdir(), "rz-alert-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "state.json");
}

test("DingTalk signature uses milliseconds and correctly encoded HMAC; no @all", async () => {
  const { url, body } = dingTalkRequest(config, "任仲塑料后台报警", 1700000000000);
  assert.equal(url.searchParams.get("timestamp"), "1700000000000");
  assert.equal(url.searchParams.get("sign"), createHmac("sha256", config.secret).update(`1700000000000\n${config.secret}`).digest("base64"));
  assert.equal(body.at.isAtAll, false);
  assert.equal(body.text.content, "任仲塑料后台报警");
});

test("HTTP success does not hide DingTalk rejection, timeout, redirect or invalid JSON", async () => {
  await sendDingTalk(config, "test", async () => Response.json({ errcode: 0 }));
  for (const result of [Response.json({ errcode: 310000 }), new Response("bad", { status: 503 }), new Response("not-json")]) {
    await assert.rejects(sendDingTalk(config, "test", async () => result));
  }
  await assert.rejects(sendDingTalk(config, "test", async () => { throw new Error("network with secrets"); }));
});

test("channel configuration only accepts signed official DingTalk endpoints", async (t) => {
  const path = await temp(t);
  await writeFile(path, JSON.stringify(config)); assert.deepEqual(await loadChannel(path), config);
  for (const webhook of ["http://oapi.dingtalk.com/robot/send?access_token=x", "https://evil.example/robot/send?access_token=x", "https://oapi.dingtalk.com/other?access_token=x", "https://oapi.dingtalk.com/robot/send"]) {
    await writeFile(path, JSON.stringify({ ...config, webhook })); await assert.rejects(loadChannel(path));
  }
  await writeFile(path, JSON.stringify({ ...config, secret: "" })); await assert.rejects(loadChannel(path));
  await writeFile(path, JSON.stringify({ channel: "unconfigured" })); assert.equal(await loadChannel(path), null);
});

test("mobile templates whitelist safe fields and deduplicate projected firing end times", () => {
  const initial = payload(); const notice = grafanaNotice(initial);
  for (const secret of ["private-customer", "private-sql", "private-token"]) assert.ok(!notice.text.includes(secret));
  assert.match(notice.text, /客户订单/); assert.match(notice.text, /窗口内次数：3/);
  initial.alerts[0].endsAt = "2026-10-20T00:10:00Z";
  assert.equal(grafanaNotice(initial).key, notice.key);
  assert.notEqual(grafanaNotice(payload("resolved")).key, notice.key);
  initial.alerts[0].labels.verification_id = "prod-smoke-123456abcdef";
  assert.equal(grafanaNotice(initial).verificationId, "prod-smoke-123456abcdef");
  initial.alerts[0].labels.verification_id = "untrusted marker with extra content";
  assert.equal(grafanaNotice(initial).verificationId, null);
  for (const invalid of [null, {}, { status: "firing", alerts: [] }, { status: "firing", alerts: [{}] }]) assert.throws(() => grafanaNotice(invalid));
});

test("Docker log decoding handles multiple streams and rejects incomplete frames", () => {
  const frame = (stream, text) => { const body = Buffer.from(text); const header = Buffer.alloc(8); header[0] = stream; header.writeUInt32BE(body.length, 4); return Buffer.concat([header, body]); };
  assert.equal(dockerLogText(Buffer.concat([frame(1, "中文\n"), frame(2, "stderr\n")])), "中文\nstderr\n");
  assert.throws(() => dockerLogText(Buffer.from([1, 0, 0])));
  assert.throws(() => dockerLogText(frame(1, "abc").subarray(0, 9)));
});

test("production acceptance requires the exact incident, status and confirmed channel delivery", () => {
  const item = { event: "ALERT_DELIVERED", verificationId: "prod-smoke-123456abcdef", status: "firing" };
  const logs = `startup\n${JSON.stringify(item)}\n`;
  assert.equal(hasDelivery(logs, item.verificationId, "firing"), true);
  assert.equal(hasDelivery(logs, item.verificationId, "resolved"), false);
  assert.equal(hasDelivery(logs, "prod-smoke-abcdef123456", "firing"), false);
  assert.equal(hasDelivery(JSON.stringify({ ...item, event: "ALERT_RETRY_SCHEDULED" }), item.verificationId, "firing"), false);
});

test("durable retry survives restart, preserves firing/resolved order and cooldown", async (t) => {
  let now = 1000000; const path = await temp(t); let box = await Outbox.open(path, { now: () => now });
  const firing = grafanaNotice(payload()); const resolved = grafanaNotice(payload("resolved"));
  assert.equal(await box.enqueue(firing), "queued");
  assert.equal(await box.enqueue(firing), "duplicate");
  await box.enqueue(resolved);
  await box.processOne(async () => { throw new Error("offline"); });
  assert.equal(box.state.pending[0].attempts, 1);
  box = await Outbox.open(path, { now: () => now });
  const delivered = [];
  await box.processOne(async (text) => delivered.push(text)); assert.equal(delivered.length, 0);
  now += 5000;
  await box.processOne(async (text) => delivered.push(text));
  await box.processOne(async (text) => delivered.push(text));
  assert.deepEqual(delivered, [firing.text, resolved.text]);
  assert.equal(await box.enqueue(firing), "duplicate");
  now += 300001; assert.equal(await box.enqueue(firing), "queued");
  assert.equal((await Outbox.open(path)).state.pending.length, 1);
});

test("concurrent enqueue and delivery do not lose acknowledged notifications", async (t) => {
  const box = await Outbox.open(await temp(t));
  await Promise.all(Array.from({ length: 20 }, (_, i) => box.enqueue({ key: `key-${i}`, text: `message-${i}` })));
  let finish; const delivery = box.processOne(() => new Promise((resolve) => { finish = resolve; }));
  await box.enqueue({ key: "during-delivery", text: "new" });
  finish(); await delivery;
  assert.equal(box.state.pending.length, 20);
  assert.ok(box.state.pending.some((item) => item.key === "during-delivery"));
});

test("corrupt, unwritable and full state must not be acknowledged or discarded", async (t) => {
  const path = await temp(t);
  await writeFile(path, "broken"); await assert.rejects(Outbox.open(path));
  await rm(path);
  const box = await Outbox.open(path, { limit: 1 }); await box.enqueue({ key: "a", text: "a" });
  await assert.rejects(box.enqueue({ key: "b", text: "b" }), /OUTBOX_FULL/);
  assert.equal((await Outbox.open(path)).state.pending.length, 1);
  const invalid = await Outbox.open(join(path, "child"));
  await assert.rejects(invalid.enqueue({ key: "x", text: "x" }));
  assert.equal(invalid.state.pending.length, 0); assert.equal(invalid.health(true).ok, false);
});

test("notifier health exposes missing channel and deliveries stuck over 15 minutes", async (t) => {
  let now = 1000; const box = await Outbox.open(await temp(t), { now: () => now });
  assert.equal(box.health(false).ok, false);
  assert.equal(box.health(true).ok, true);
  await box.enqueue({ key: "a", text: "a" }); now += 900000;
  assert.equal(box.health(true).ok, false);
});

test("HTTP receiver authenticates and stores before 202; validates bodies and size", async (t) => {
  const path = await temp(t); const box = await Outbox.open(path); const token = "x".repeat(40);
  const server = createAlertServer({ token, outbox: box, configured: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (body, credential = token) => fetch(`${url}/grafana`, { method: "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, body });
  assert.equal(authorized(`Bearer ${token}`, token), true);
  assert.equal((await post(JSON.stringify(payload()), "bad")).status, 401);
  assert.equal((await post("not-json")).status, 400);
  assert.equal((await post("x".repeat(70000))).status, 413);
  assert.equal((await post(JSON.stringify(payload()))).status, 202);
  assert.equal(JSON.parse(await readFile(path, "utf8")).pending.length, 1);
  assert.equal((await (await post(JSON.stringify(payload()))).json()).status, "duplicate");
  assert.equal((await fetch(`${url}/health`)).status, 200);
});

test("external monitoring ignores login redirects, fake HTML and HTTP 200 error bodies", async () => {
  assert.equal(await probe("https://example.com/api/health", async () => Response.json({ status: "ok" })), true);
  for (const response of [Response.json({ status: "unavailable" }, { status: 503 }), Response.json({ status: "unavailable" }), new Response("<html>login</html>"), new Response(null, { status: 302 })]) {
    assert.equal(await probe("https://example.com/api/health", async () => response), false);
  }
});

test("external detector requires 3 failures, 2 successes, persists state and repeats at 30 minutes", async (t) => {
  const path = await temp(t); let box = await Outbox.open(path); let now = 1000000;
  const bad = async () => Response.json({ status: "unavailable" }, { status: 503 });
  const good = async () => Response.json({ status: "ok" });
  for (let i = 0; i < 2; i++) { await monitorOnce(box, "unused", bad, now); now += 30000; }
  assert.equal(box.state.pending.length, 0);
  box = await Outbox.open(path); await monitorOnce(box, "unused", bad, now);
  assert.equal(box.state.pending.length, 1); assert.equal(box.state.monitor.failing, true);
  const repeat = transition(box.state.monitor, false, now + 1800000);
  assert.ok(repeat.notice);
  await monitorOnce(box, "unused", good, now + 30000); assert.equal(box.state.pending.length, 1);
  await monitorOnce(box, "unused", good, now + 60000); assert.equal(box.state.pending.length, 2);
  await monitorOnce(box, "unused", good, now + 90000); assert.equal(box.state.pending.length, 2);
  assert.match(box.state.pending[1].text, /恢复/);
});
