import { readFile } from "node:fs/promises";
import { writeState } from "../alerting/outbox.mjs";
import { validTask } from "../alerting/analysis.mjs";

export const budgetDay = (now) => new Date(now + 8 * 3600000).toISOString().slice(0, 10);
const nextDay = (now) => (Math.floor((now + 8 * 3600000) / 86400000) + 1) * 86400000 - 8 * 3600000;
const initial = () => ({ version: 1, pending: [], reports: [], completed: {}, usage: {} });

export class AgentStore {
  constructor(path, state, { now = Date.now, limit = 100 } = {}) {
    this.path = path; this.state = state; this.now = now; this.limit = limit;
    this.tail = Promise.resolve(); this.busy = false; this.storageFailed = false;
  }
  static async open(path, options) {
    let state;
    try { state = JSON.parse(await readFile(path, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; state = initial(); }
    const map = (value) => value && typeof value === "object" && !Array.isArray(value);
    if (state.version !== 1 || !Array.isArray(state.pending) || !Array.isArray(state.reports)
      || !map(state.completed) || !map(state.usage)
      || Object.entries(state.completed).some(([key, time]) => !/^[a-f0-9]{64}$/.test(key) || !Number.isFinite(time))
      || Object.entries(state.usage).some(([day, calls]) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(calls) || calls < 0)
      || state.pending.some((job) => !validTask(job.task) || !Number.isInteger(job.attempts) || job.attempts < 0 || !Number.isFinite(job.nextAttemptAt))
      || state.reports.some((report) => !validTask(report.task) || !Number.isFinite(report.createdAt) || !["completed", "failed"].includes(report.status))) throw new Error("INVALID_AGENT_STATE");
    return new AgentStore(path, state, options);
  }
  async update(fn) {
    const operation = this.tail.then(async () => {
      const state = structuredClone(this.state);
      const result = fn(state);
      try { await writeState(this.path, state); this.storageFailed = false; }
      catch (error) { this.storageFailed = true; throw error; }
      this.state = state;
      return result;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  async enqueue(task) {
    if (!validTask(task)) throw new Error("INVALID_TASK");
    // Rebuild the envelope: even authenticated callers cannot store extra fields.
    task = { version: 1, key: task.key, receivedAt: task.receivedAt,
      incidents: task.incidents.map(({ rule, module, startsAt, count }) => ({ rule, module, startsAt, count })) };
    return this.update((state) => {
      const now = this.now();
      if (task.receivedAt > now + 60000 || now - task.receivedAt > 86400000) throw new Error("EXPIRED_TASK");
      state.completed = Object.fromEntries(Object.entries(state.completed).filter(([, time]) => now - time < 7 * 86400000));
      if (state.pending.some((job) => job.task.key === task.key) || state.completed[task.key] !== undefined) return "duplicate";
      if (state.pending.length >= this.limit) throw new Error("AGENT_QUEUE_FULL");
      state.pending.push({ task, attempts: 0, nextAttemptAt: now });
      return "queued";
    });
  }
  async reserveCall(limit) {
    return this.update((state) => {
      const day = budgetDay(this.now());
      if ((state.usage[day] ?? 0) >= limit) throw new Error("DAILY_BUDGET_EXHAUSTED");
      state.usage = { [day]: (state.usage[day] ?? 0) + 1 };
    });
  }
  health(configured) {
    const oldest = this.state.pending[0];
    return { ok: !this.storageFailed && (!oldest || this.now() - oldest.task.receivedAt < 900000), configured,
      status: configured ? "enabled" : "disabled", pending: this.state.pending.length,
      reports: this.state.reports.length, storageFailed: this.storageFailed,
      todayModelCalls: this.state.usage[budgetDay(this.now())] ?? 0 };
  }
  async processOne(analyze) {
    if (this.busy) return;
    this.busy = true;
    try {
      const job = this.state.pending.find((item) => item.nextAttemptAt <= this.now());
      if (!job) return;
      let report; let errorCode;
      try {
        if (this.now() - job.task.receivedAt > 86400000) throw new Error("TASK_EXPIRED");
        report = await analyze(job.task);
      } catch (error) {
        errorCode = error.message === "DAILY_BUDGET_EXHAUSTED" ? error.message : "ANALYSIS_UNAVAILABLE";
        const knownCodes = ["UPSTREAM_HTTP_FAILURE", "EMPTY_UPSTREAM_RESPONSE", "UPSTREAM_RESPONSE_TOO_LARGE", "INVALID_LOKI_RESPONSE",
          "MODEL_INCOMPLETE", "MODEL_TOOL_REJECTED", "MODEL_REFUSED", "MODEL_INVALID_JSON", "MODEL_INVALID_TOOL_JSON", "INVALID_AGENT_REPORT", "MODEL_INPUT_LIMIT", "TOOL_LIMIT", "TOOL_NOT_ALLOWED", "AGENT_ROUND_LIMIT", "TASK_EXPIRED", "DAILY_BUDGET_EXHAUSTED"];
        console.error(JSON.stringify({ event: "AGENT_ANALYSIS_RETRY", reportId: job.task.key,
          reason: knownCodes.includes(error.message) ? error.message : "ANALYSIS_UNAVAILABLE",
          kind: ["Error", "SyntaxError", "TypeError", "TimeoutError", "AbortError"].includes(error.name) ? error.name : "Error",
          ...(["root-fields", "summary-text", "facts-list", "fact-fields-or-text", "fact-evidence", "hypotheses-list", "hypothesis-fields-or-text", "hypothesis-evidence", "checks-list-or-text", "limitations-list-or-text"].includes(error.validationIssue) ? { validationIssue: error.validationIssue } : {}),
          ...(Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599 ? { httpStatus: error.httpStatus } : {}) }));
      }
      await this.update((state) => {
        const current = state.pending.find((item) => item.task.key === job.task.key);
        if (!current) throw new Error("AGENT_JOB_MISSING");
        if (errorCode === "DAILY_BUDGET_EXHAUSTED") { current.nextAttemptAt = nextDay(this.now()); return; }
        if (errorCode && current.attempts < 2 && this.now() - current.task.receivedAt <= 86400000) {
          current.attempts += 1; current.nextAttemptAt = this.now() + 60000 * current.attempts; return;
        }
        const result = report ?? { summary: "诊断暂不可用，请通过 Grafana 人工排查。", facts: [], hypotheses: [], checks: [],
          limitations: ["日志查询、模型调用或报告校验失败；未确认根因。"], evidence: [], queries: [], errorCode };
        state.reports.push({ ...result, task: current.task, status: report ? "completed" : "failed", createdAt: this.now() });
        state.reports = state.reports.filter((item) => this.now() - item.createdAt < 7 * 86400000).slice(-100);
        state.completed[current.task.key] = this.now();
        state.completed = Object.fromEntries(Object.entries(state.completed).filter(([, time]) => this.now() - time < 7 * 86400000).slice(-2000));
        state.pending = state.pending.filter((item) => item.task.key !== current.task.key);
      });
      if (report) console.info(JSON.stringify({ event: "AGENT_REPORT_SAVED", reportId: job.task.key }));
    } finally { this.busy = false; }
  }
}
