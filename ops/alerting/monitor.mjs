import { pathToFileURL } from "node:url";
import { loadChannel, sendDingTalk, digest } from "./notification.mjs";
import { Outbox } from "./outbox.mjs";

export async function probe(url, fetcher = fetch) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: "error", headers: { "Cache-Control": "no-cache" } });
    const body = await response.json();
    return response.status === 200 && body.status === "ok";
  } catch { return false; }
}

export function transition(previous, healthy, now, { failures = 3, successes = 2, repeatMs = 1800000 } = {}) {
  const state = previous ? structuredClone(previous) : { failing: false, failures: 0, successes: 0, incident: null, lastNoticeAt: 0, firstFailureAt: null };
  state.failures = healthy ? 0 : Math.min(failures, state.failures + 1);
  state.successes = healthy ? Math.min(successes, state.successes + 1) : 0;
  if (!healthy && state.firstFailureAt === null) state.firstFailureAt = now;
  let notice = null;
  if (state.failures >= failures && (!state.failing || now - state.lastNoticeAt >= repeatMs)) {
    state.incident ??= new Date(state.firstFailureAt).toISOString();
    state.failing = true; state.lastNoticeAt = now;
    notice = { key: digest(`external:firing:${state.incident}:${Math.floor(now / repeatMs)}`), text: `🚨 任仲塑料后台报警\n环境：production\n网站或数据库连续 ${failures} 次健康检查失败\n首次失败：${state.incident}\n请检查服务器、网络、HTTPS 和数据库；外部检测不代表已确定根因。` };
  } else if (healthy && state.failing && state.successes >= successes) {
    notice = { key: digest(`external:resolved:${state.incident}`), text: `✅ 任仲塑料后台报警恢复\n环境：production\n网站与数据库连续 ${successes} 次健康检查成功\n故障开始：${state.incident}\n恢复时间：${new Date(now).toISOString()}` };
    state.failing = false; state.incident = null; state.firstFailureAt = null; state.lastNoticeAt = now;
  }
  if (healthy && !state.failing) state.firstFailureAt = null;
  return { state, notice };
}

export async function monitorOnce(outbox, url, fetcher = fetch, now = Date.now()) {
  const { state, notice } = transition(outbox.state.monitor, await probe(url, fetcher), now);
  await outbox.enqueue(notice, state); // Transition and notification commit together.
  if (notice) console.info(JSON.stringify({ event: state.failing ? "EXTERNAL_OUTAGE_QUEUED" : "EXTERNAL_RECOVERY_QUEUED" }));
}

export async function main() {
  const target = new URL(process.env.TARGET_HEALTH_URL);
  if (target.protocol !== "https:" || target.pathname !== "/api/health" || target.username || target.password || target.search || target.hash) throw new Error("INVALID_HEALTH_TARGET");
  const config = await loadChannel(process.env.ALERT_CHANNEL_FILE ?? "/run/secrets/alert_channel");
  if (!config) throw new Error("CHANNEL_NOT_CONFIGURED");
  const outbox = await Outbox.open(process.env.ALERT_STATE_FILE ?? "/var/lib/warehouse-alerts/monitor.json");
  await outbox.enqueue(null);
  console.info("EXTERNAL_MONITOR_STARTED");
  let stopped = false;
  for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => { stopped = true; });
  let nextProbeAt = 0;
  while (!stopped) {
    try {
      if (Date.now() >= nextProbeAt) { await monitorOnce(outbox, target); nextProbeAt = Date.now() + 30000; }
      await outbox.processOne((text) => sendDingTalk(config, text));
    } catch { console.error("EXTERNAL_MONITOR_CYCLE_FAILED: check state volume and notification configuration"); }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("EXTERNAL_MONITOR_START_FAILED: check target and secret files"); process.exitCode = 1; });
}
