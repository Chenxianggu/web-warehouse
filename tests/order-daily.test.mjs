import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validDate, reportDateAllowed, dueDate, collectDailySnapshot, DAILY_QUERY } from "../ops/agent/daily-source.mjs";
import { buildDailyFacts, difference, renderDailyReport, validateDailySelection } from "../ops/agent/daily-facts.mjs";
import { DailyStore } from "../ops/agent/daily-store.mjs";
import { summarizeDaily } from "../ops/agent/daily-summary.mjs";
import { createAgentServer } from "../ops/agent/server.mjs";
import { AgentStore } from "../ops/agent/store.mjs";
import { dailyDeliveryTransport, renderDailyNotice } from "../ops/agent/daily-delivery.mjs";
import { dailyNotice, dailyKey } from "../ops/alerting/daily-notification.mjs";
import { Outbox } from "../ops/alerting/outbox.mjs";
import { createAlertServer } from "../ops/alerting/server.mjs";
import { sendDingTalk } from "../ops/alerting/notification.mjs";

const NOW = Date.parse("2026-10-20T01:00:00Z");
const metrics = (extra = {}) => ({ orders: "2", packs: "60", tons: "1.500000", amount: "12000.01", shippedOrders: "1", unshippedOrders: "1", zeroPriceLines: "0", defaultConversionLines: "0", ambiguousMaterialLines: "0", ...extra });
const snapshot = (date = "2026-10-19") => ({ version: 1, reportDate: date, capturedAt: new Date(NOW).toISOString(),
  totals: { ...metrics(), customers: "1" }, backlog: metrics({ orders: "1" }),
  customers: [{ code: "private-client-code", name: "private-client-name", metrics: metrics() }],
  activity: { createdOrders: "2", deletedOrders: "0", modifiedOrders: "1", shipOperations: "1", unshipOperations: "0", unattributedItemEvents: "0" } });
async function temp(t) { const path = await mkdtemp(join(tmpdir(), "rz-daily-")); t.after(() => rm(path, { recursive: true, force: true })); return join(path, "state.json"); }

test("daily calendar uses Shanghai midnight and 08:00, rejects invalid, current, future and too-old dates", () => {
  assert.equal(validDate("2026-02-30"), false); assert.equal(validDate("2024-02-29"), true);
  assert.equal(reportDateAllowed("2026-10-19", NOW), true); assert.equal(reportDateAllowed("2026-10-20", NOW), false);
  assert.equal(reportDateAllowed("2026-01-01", NOW), false); assert.equal(reportDateAllowed("2026-10-19';drop", NOW), false);
  assert.equal(dueDate(Date.parse("2026-10-19T23:59:59Z")), null);
  assert.equal(dueDate(Date.parse("2026-10-20T00:00:00Z")), "2026-10-19");
  assert.throws(() => dueDate(NOW, "25:00"));
});

test("source queries are parameterized and all data comes from one read-only repeatable snapshot", async () => {
  const calls = []; let released = false;
  const client = { query: async (sql, values) => { calls.push({ sql, values }); return { rows: sql === DAILY_QUERY ? [{ snapshot: snapshot() }] : [] }; }, release: () => { released = true; } };
  const result = await collectDailySnapshot({ connect: async () => client }, "2026-10-19");
  assert.equal(result.totals.amount, "12000.01"); assert.equal(released, true);
  assert.match(calls[0].sql, /REPEATABLE READ READ ONLY/); assert.equal(calls.at(-1).sql, "COMMIT");
  assert.deepEqual(calls[2].values, ["2026-10-19"]); assert.ok(!calls[2].sql.includes("2026-10-19"));
  const failing = { query: async (sql) => { calls.push({ sql }); if (sql === DAILY_QUERY) throw new Error("private-db-message"); return { rows: [] }; }, release() {} };
  await assert.rejects(collectDailySnapshot({ connect: async () => failing }, "2026-10-19")); assert.equal(calls.at(-1).sql, "ROLLBACK");
});

test("exact decimal comparisons retain cents beyond JavaScript safe integers", () => {
  assert.equal(difference("9007199254740993.01", "9007199254740993.00", 2), "0.01");
  assert.equal(difference("0.000001", "1.000000", 6), "-0.999999");
  assert.throws(() => difference("NaN", "0", 2));
});

test("model facts use stable customer aliases, final local report restores names and preserves all customer rows", () => {
  const data = snapshot(); const catalog = buildDailyFacts(data, null, "local-secret");
  const remote = JSON.stringify(catalog.facts);
  assert.ok(!remote.includes("private-client")); assert.match(remote, /客户-[a-f0-9]{12}/);
  assert.equal(JSON.stringify(buildDailyFacts(data, null, "local-secret").facts), remote);
  const report = { date: data.reportDate, snapshot: data, aiStatus: "completed", selection: { focusFactIds: ["customer-1", "volume"], actionIds: ["keep_monitoring"] } };
  const markdown = renderDailyReport(report, null, "local-secret");
  assert.match(markdown, /private-client-name/); assert.match(markdown, /12000.01/); assert.match(markdown, /不是历史午夜/);
  assert.throws(() => validateDailySelection({ focusFactIds: ["invented"], actionIds: [] }, catalog));
  assert.throws(() => validateDailySelection({ focusFactIds: ["orders"], actionIds: ["review_zero_prices"] }, catalog));
  assert.throws(() => validateDailySelection({ focusFactIds: ["orders"], actionIds: [], amount: "1" }, catalog));
});

test("snapshot is persisted before model calls, retries survive restart without recollecting or changing numbers", async (t) => {
  let now = NOW; const path = await temp(t); let store = await DailyStore.open(path, { now: () => now }); let collections = 0;
  await store.enqueue("2026-10-19");
  await store.tick({ at: "23:59", modelConfigured: true, collect: async () => { collections++; return snapshot(); }, summarize: async () => { throw new Error("private-upstream"); } });
  const saved = JSON.parse(await readFile(path, "utf8")); assert.equal(saved.reports["2026-10-19"].snapshot.totals.amount, "12000.01");
  store = await DailyStore.open(path, { now: () => now }); now += 60000;
  await store.tick({ at: "23:59", modelConfigured: true, collect: async () => { throw new Error("must-not-recollect"); },
    summarize: async () => ({ selection: { focusFactIds: ["orders"], actionIds: ["keep_monitoring"] }, model: "deepseek-flash" }) });
  assert.equal(collections, 1); assert.equal(store.state.reports["2026-10-19"].aiStatus, "completed");
  assert.equal(await store.enqueue("2026-10-19"), "existing"); assert.ok(!JSON.stringify(saved).includes("private-upstream"));
});

test("missing or failed model leaves authoritative numeric report available; daily calls share persisted agent budget", async (t) => {
  const store = await DailyStore.open(await temp(t), { now: () => NOW }); await store.enqueue("2026-10-19");
  const budget = await AgentStore.open(await temp(t), { now: () => NOW }); await budget.reserveCall(1);
  await store.tick({ at: "23:59", modelConfigured: true, collect: async () => snapshot(), summarize: () => budget.reserveCall(1) });
  assert.equal(store.state.reports["2026-10-19"].snapshot.totals.orders, "2");
  assert.equal(store.state.reports["2026-10-19"].attempts, 0);
  assert.match(renderDailyReport(store.state.reports["2026-10-19"], null, "secret"), /12000.01/);
  const disabled = await DailyStore.open(await temp(t), { now: () => NOW });
  await disabled.tick({ modelConfigured: false, collect: async () => snapshot(), at: "08:00" });
  assert.equal(disabled.state.reports["2026-10-19"].aiStatus, "disabled");
  assert.equal(Object.keys(disabled.state.reports).length, 1);
});

test("scheduled report is generated once across repeated ticks and process restart", async (t) => {
  const path = await temp(t); let collections = 0;
  const options = { at: "08:00", modelConfigured: false, collect: async () => { collections++; return snapshot(); } };
  const store = await DailyStore.open(path, { now: () => NOW });
  await Promise.all([store.tick(options), store.tick(options)]);
  await store.tick(options);
  const restarted = await DailyStore.open(path, { now: () => NOW });
  await restarted.tick(options);
  assert.equal(collections, 1); assert.equal(Object.keys(restarted.state.reports).length, 1);
});

test("backfilling a previous date never changes an existing report's frozen comparison baseline", async (t) => {
  const store = await DailyStore.open(await temp(t), { now: () => NOW });
  await store.enqueue("2026-10-19"); await store.tick({ at: "23:59", modelConfigured: false, collect: async (date) => snapshot(date) });
  const before = renderDailyReport(store.state.reports["2026-10-19"], null, "secret");
  await store.enqueue("2026-10-18"); await store.tick({ at: "23:59", modelConfigured: false, collect: async (date) => snapshot(date) });
  assert.equal(renderDailyReport(store.state.reports["2026-10-19"], store.state.reports["2026-10-18"], "secret"), before);
});

test("manual retry preserves a disabled numeric snapshot and completed reports remain immutable", async (t) => {
  const store = await DailyStore.open(await temp(t), { now: () => NOW });
  await store.enqueue("2026-10-19");
  await store.tick({ at: "23:59", modelConfigured: false, collect: async () => snapshot() });
  const frozen = JSON.stringify(store.state.reports["2026-10-19"].snapshot);
  assert.equal(await store.enqueue("2026-10-19", { retry: true }), "queued");
  await store.tick({ at: "23:59", modelConfigured: true, collect: async () => { throw new Error("must not recapture"); },
    summarize: async () => ({ selection: { focusFactIds: ["orders"], actionIds: [] } }) });
  assert.equal(JSON.stringify(store.state.reports["2026-10-19"].snapshot), frozen);
  assert.equal(await store.enqueue("2026-10-19", { retry: true }), "existing");
});

test("corrupt daily state is rejected; failed writes cannot be acknowledged", async (t) => {
  const path = await temp(t); await writeFile(path, "invalid"); await assert.rejects(DailyStore.open(path)); await rm(path);
  const store = await DailyStore.open(path, { now: () => NOW }); await store.enqueue("2026-10-19");
  const bad = new DailyStore(join(path, "child"), { version: 1, reports: {} }, { now: () => NOW });
  await assert.rejects(bad.enqueue("2026-10-19")); assert.equal(bad.health().storageFailed, true);
});

test("daily model receives only verified facts and allowed actions, correction cannot alter numbers", async () => {
  let calls = 0; const bodies = [];
  const result = await summarizeDaily(snapshot(), null, "secret", { model: "deepseek-flash", apiKey: "fake", dailyCallLimit: 40 }, { reserveCall: async () => { calls++; } }, {
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.deepseek.com/responses"); bodies.push(options.body);
      const value = calls === 1 ? { focusFactIds: ["unknown"], actionIds: [] } : { focusFactIds: ["orders", "volume"], actionIds: ["keep_monitoring"] };
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] });
    },
  });
  assert.equal(result.modelCalls, 2); assert.ok(!bodies.join("").includes("private-client")); assert.ok(!bodies.join("").includes("local-secret"));
  assert.equal(result.selection.focusFactIds[1], "volume");
});

test("daily HTTP entry authenticates, stores before acknowledgement, rejects current dates and exposes no report data", async (t) => {
  const daily = await DailyStore.open(await temp(t), { now: () => NOW }); const incident = await AgentStore.open(await temp(t)); const token = "test-token".repeat(5);
  const server = createAgentServer({ token, store: incident, configured: true, dailyStore: daily });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (date, credential = token) => fetch(`${url}/daily-orders`, { method: "POST", headers: { Authorization: `Bearer ${credential}` }, body: JSON.stringify({ date }) });
  assert.equal((await post("2026-10-19", "bad")).status, 401); assert.equal((await post("2026-10-20")).status, 400);
  assert.equal((await post("2026-10-19")).status, 202); assert.ok((await readFile(daily.path, "utf8")).includes("2026-10-19"));
  assert.equal((await fetch(`${url}/daily-orders`)).status, 404);
  assert.equal((await (await fetch(`${url}/health`)).json()).dailyOrders.pending, 1);
});

test("DingTalk report uses frozen numeric facts, local customer names, explicit environment and bounded text", () => {
  const report = { date: "2026-10-19", snapshot: snapshot(), aiStatus: "completed", comparisonBase: null,
    selection: { focusFactIds: ["volume", "customer-1"], actionIds: ["review_backlog"] } };
  const message = renderDailyNotice(report, "never-send-secret", "development");
  assert.match(message.text, /本地开发环境/); assert.match(message.text, /12000\.01/);
  assert.match(message.text, /private-client-name/); assert.ok(!message.text.includes("never-send-secret"));
  assert.equal(dailyNotice(message).key, "order-daily:development:2026-10-19");
  assert.ok(Buffer.byteLength(message.text) <= 12000);
  assert.throws(() => dailyNotice({ ...message, text: `${message.text}${"中".repeat(4000)}` }));
  assert.throws(() => dailyKey("production", "2026-02-30"));
  assert.throws(() => renderDailyNotice({ ...report, selection: { focusFactIds: ["invented"], actionIds: [] } }, "salt", "development"));
});

test("scheduled report reaches authenticated durable DingTalk queue, retries lost acknowledgements and survives restarts without resending", async (t) => {
  let now = NOW; const path = await temp(t); const outboxPath = await temp(t);
  let daily = await DailyStore.open(path, { now: () => now }); let box = await Outbox.open(outboxPath, { now: () => now });
  const token = "agent-token".repeat(4); const grafanaToken = "grafana-token".repeat(4);
  const server = createAlertServer({ token: grafanaToken, agentToken: token, outbox: box, configured: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const transport = dailyDeliveryTransport(token, { baseUrl }); let collections = 0;
  const options = { notify: true, environment: "development", modelConfigured: false, collect: async () => { collections++; return snapshot(); } };
  await daily.tick(options);
  assert.equal(daily.state.reports["2026-10-19"].delivery.status, "pending");
  const message = renderDailyNotice(daily.state.reports["2026-10-19"], token, "development");
  const post = (credential, body = message) => fetch(`${baseUrl}/order-daily`, { method: "POST", headers: { Authorization: `Bearer ${credential}` }, body: JSON.stringify(body) });
  assert.equal((await post(grafanaToken)).status, 401); assert.equal((await post(token, { ...message, date: "2026-02-30" })).status, 400);
  assert.equal((await fetch(`${baseUrl}/order-daily/development/2026-10-19`)).status, 401);
  await daily.deliverOne({ ...transport, submit: async (payload) => { await transport.submit(payload); throw new Error("lost-ack-private"); } });
  assert.equal(box.state.pending.length, 1); assert.equal(daily.state.reports["2026-10-19"].delivery.status, "pending");
  daily = await DailyStore.open(path, { now: () => now }); now += 5000;
  await Promise.all([daily.deliverOne(transport), daily.deliverOne(transport)]);
  assert.equal(box.state.pending.length, 1); assert.equal(daily.state.reports["2026-10-19"].delivery.status, "queued");
  assert.equal((await Outbox.open(outboxPath)).state.pending.length, 1);
  const config = { webhook: "https://oapi.dingtalk.com/robot/send?access_token=fake", secret: "SEC-fake" };
  await box.processOne((text) => sendDingTalk(config, text, async () => Response.json({ errcode: 310000 })));
  assert.equal(box.dailyStatus(dailyNotice(message).key).status, "queued");
  now += 5000; let delivered = 0;
  await box.processOne((text) => sendDingTalk(config, text, async () => { delivered++; assert.match(text, /客户订单日报/); return Response.json({ errcode: 0 }); }));
  now += 15000; await daily.deliverOne(transport);
  assert.equal(daily.state.reports["2026-10-19"].delivery.status, "delivered");
  assert.equal(daily.state.reports["2026-10-19"].delivery.deliveredAt, NOW + 10000);
  daily = await DailyStore.open(path, { now: () => now }); await daily.deliverOne(transport); await daily.tick(options);
  assert.equal(delivered, 1); assert.equal(collections, 1);
  now += 2 * 86400000;
  box = await Outbox.open(outboxPath, { now: () => now });
  assert.equal(await box.enqueue(dailyNotice(message)), "duplicate"); assert.equal(box.state.pending.length, 0);
  assert.equal(box.dailyStatus(dailyNotice(message).key).status, "delivered");
  assert.ok(!(await readFile(path, "utf8")).includes("lost-ack-private"));
});

test("existing reports are sent only by explicit notify and notify does not call the model or recollect", async (t) => {
  const daily = await DailyStore.open(await temp(t), { now: () => NOW });
  await daily.tick({ modelConfigured: false, collect: async () => snapshot() });
  await daily.tick({ notify: true, modelConfigured: true, collect: async () => { throw new Error("must not recollect"); }, summarize: async () => { throw new Error("must not call model"); } });
  assert.equal(daily.state.reports["2026-10-19"].delivery, undefined);
  const incident = await AgentStore.open(await temp(t)); const token = "daily-token".repeat(4);
  const server = createAgentServer({ token, store: incident, configured: true, dailyStore: daily });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const post = (date, credential = token) => fetch(`http://127.0.0.1:${server.address().port}/daily-orders/notify`, {
    method: "POST", headers: { Authorization: `Bearer ${credential}` }, body: JSON.stringify({ date }) });
  assert.equal((await post("2026-10-19", "bad")).status, 401); assert.equal((await post("2026-10-18")).status, 400);
  assert.equal((await post("2026-10-19")).status, 202); assert.equal((await (await post("2026-10-19")).json()).status, "existing");
  assert.equal(daily.state.reports["2026-10-19"].delivery.status, "pending");
  assert.equal(daily.health().notificationPending, 1);
});

test("failed model still queues numeric daily report; database failure never sends a fabricated zero report", async (t) => {
  let now = NOW; const daily = await DailyStore.open(await temp(t), { now: () => now });
  const options = { notify: true, modelConfigured: true, collect: async () => snapshot(), summarize: async () => { throw new Error("offline"); } };
  await daily.tick(options); now += 60000; await daily.tick(options); now += 120000; await daily.tick(options);
  const report = daily.state.reports["2026-10-19"];
  assert.equal(report.aiStatus, "unavailable"); assert.equal(report.delivery.status, "pending");
  assert.match(renderDailyNotice(report, "salt", "production").text, /AI 摘要暂不可用/);
  const failed = await DailyStore.open(await temp(t), { now: () => now });
  const broken = { notify: true, modelConfigured: false, collect: async () => { throw new Error("db-offline"); } };
  await failed.tick(broken); now += 60000; await failed.tick(broken); now += 120000; await failed.tick(broken);
  assert.equal(failed.state.reports["2026-10-19"].aiStatus, "unavailable");
  assert.equal(failed.state.reports["2026-10-19"].delivery, undefined);
});
