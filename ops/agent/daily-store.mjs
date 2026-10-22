import { readFile } from "node:fs/promises";
import { writeState } from "../alerting/outbox.mjs";
import { dueDate, previousDate, reportDateAllowed, validDate } from "./daily-source.mjs";
import { dailyKey } from "../alerting/daily-notification.mjs";

export class DailyStore {
  constructor(path, state, { now = Date.now } = {}) {
    this.path = path; this.state = state; this.now = now; this.tail = Promise.resolve(); this.busy = false; this.storageFailed = false;
  }
  static async open(path, options) {
    let state;
    try { state = JSON.parse(await readFile(path, "utf8")); }
    catch (error) { if (error.code !== "ENOENT") throw error; state = { version: 1, reports: {} }; }
    if (state.version !== 1 || !state.reports || typeof state.reports !== "object" || Array.isArray(state.reports)
      || Object.entries(state.reports).some(([date, report]) => !validDate(date) || report.date !== date
        || !Number.isFinite(report.requestedAt) || !Number.isFinite(report.nextAttemptAt)
        || !Number.isInteger(report.attempts) || report.attempts < 0
        || !["pending", "completed", "disabled", "unavailable"].includes(report.aiStatus)
        || (report.snapshot && (report.snapshot.reportDate !== date || !Number.isFinite(Date.parse(report.snapshot.capturedAt))))
        || (report.delivery && (!["pending", "queued", "delivered"].includes(report.delivery.status)
          || !Number.isFinite(report.delivery.nextAttemptAt) || !Number.isInteger(report.delivery.attempts) || report.delivery.attempts < 0)))) throw new Error("INVALID_DAILY_STATE");
    return new DailyStore(path, state, options);
  }
  async update(fn) {
    const operation = this.tail.then(async () => {
      const state = structuredClone(this.state); const result = fn(state);
      try {
        if (Buffer.byteLength(JSON.stringify(state)) > 16 * 1024 * 1024) throw new Error("DAILY_STATE_FULL");
        await writeState(this.path, state); this.storageFailed = false;
      }
      catch (error) { this.storageFailed = true; throw error; }
      this.state = state; return result;
    });
    this.tail = operation.catch(() => {}); return operation;
  }
  async enqueue(date, { retry = false } = {}) {
    if (!reportDateAllowed(date, this.now())) throw new Error("INVALID_REPORT_DATE");
    const canRetry = (report) => retry && ["disabled", "unavailable"].includes(report?.aiStatus);
    if (this.state.reports[date] && !canRetry(this.state.reports[date])) return "existing";
    return this.update((state) => {
      if (state.reports[date]) {
        if (!canRetry(state.reports[date])) return "existing";
        Object.assign(state.reports[date], { aiStatus: "pending", attempts: 0, nextAttemptAt: this.now() });
        return "queued";
      }
      const pending = Object.values(state.reports).filter((report) => report.aiStatus === "pending");
      if (pending.length >= 31) throw new Error("DAILY_QUEUE_FULL");
      state.reports[date] = { date, requestedAt: this.now(), aiStatus: "pending", attempts: 0, nextAttemptAt: this.now() };
      const cutoff = this.now() - 180 * 86400000;
      state.reports = Object.fromEntries(Object.entries(state.reports).filter(([, report]) => report.requestedAt >= cutoff));
      return "queued";
    });
  }
  health() {
    const values = Object.values(this.state.reports);
    return { enabled: true, storageFailed: this.storageFailed, reports: values.filter((report) => report.snapshot).length,
      pending: values.filter((report) => report.aiStatus === "pending").length,
      unavailable: values.filter((report) => report.aiStatus === "unavailable").length,
      notificationPending: values.filter((report) => report.delivery && report.delivery.status !== "delivered").length };
  }
  async queueNotification(date, environment = "development") {
    dailyKey(environment, date);
    if (!this.state.reports[date]?.snapshot || this.state.reports[date].aiStatus === "pending") throw new Error("DAILY_REPORT_NOT_READY");
    if (this.state.reports[date].delivery) return "existing";
    return this.update((state) => {
      if (state.reports[date].delivery) return "existing";
      state.reports[date].delivery = { status: "pending", environment, attempts: 0, nextAttemptAt: this.now() };
      return "queued";
    });
  }
  async deliverOne({ render, submit, status }) {
    if (this.deliveryBusy) return;
    this.deliveryBusy = true;
    try {
      const report = Object.values(this.state.reports).find((item) => item.delivery && item.delivery.status !== "delivered" && item.delivery.nextAttemptAt <= this.now());
      if (!report) return;
      const delivery = report.delivery;
      try {
        if (delivery.status === "pending") {
          // Freeze the exact message before submitting it, including across a
          // lost acknowledgement, model retry, configuration change or restart.
          if (!delivery.payload) await this.update((state) => { state.reports[report.date].delivery.payload = render(report, delivery.environment); });
          await submit(this.state.reports[report.date].delivery.payload);
          await this.update((state) => { Object.assign(state.reports[report.date].delivery, { status: "queued", queuedAt: this.now(), nextAttemptAt: this.now() + 15000 }); });
        } else {
          const result = await status(delivery.environment, report.date);
          await this.update((state) => {
            const current = state.reports[report.date].delivery;
            current.nextAttemptAt = this.now() + 15000;
            if (result.status === "delivered") Object.assign(current, { status: "delivered", deliveredAt: result.deliveredAt });
            else if (result.status === "missing") current.status = "pending";
          });
          if (result.status === "delivered") console.info(JSON.stringify({ event: "ORDER_DAILY_DELIVERED", date: report.date }));
        }
      } catch (error) {
        if (this.storageFailed) throw error;
        await this.update((state) => {
          const current = state.reports[report.date].delivery;
          current.attempts++;
          current.nextAttemptAt = this.now() + Math.min(300000, 5000 * 2 ** Math.min(current.attempts - 1, 6));
        });
        console.error(JSON.stringify({ event: "ORDER_DAILY_NOTIFY_RETRY", date: report.date }));
      }
    } finally { this.deliveryBusy = false; }
  }
  async tick({ collect, summarize, modelConfigured, at = "08:00", notify = false, environment = "development" }) {
    if (this.busy) return;
    this.busy = true;
    try {
      const date = dueDate(this.now(), at);
      if (date) await this.enqueue(date);
      const job = Object.values(this.state.reports).find((report) => report.aiStatus === "pending" && report.nextAttemptAt <= this.now());
      if (!job) return;
      try {
        if (!job.snapshot) {
          const snapshot = await collect(job.date);
          await this.update((state) => {
            const previous = state.reports[previousDate(job.date)]?.snapshot;
            state.reports[job.date].snapshot = snapshot;
            state.reports[job.date].comparisonBase = previous ? { snapshot: { reportDate: previous.reportDate, capturedAt: previous.capturedAt, totals: previous.totals } } : null;
          });
        }
        const current = this.state.reports[job.date];
        const result = modelConfigured ? await summarize(current.snapshot, current.comparisonBase) : null;
        await this.update((state) => {
          Object.assign(state.reports[job.date], result ?? {}, { aiStatus: modelConfigured ? "completed" : "disabled", completedAt: this.now() });
          if (notify) state.reports[job.date].delivery ??= { status: "pending", environment, attempts: 0, nextAttemptAt: this.now() };
        });
        console.info(JSON.stringify({ event: "ORDER_DAILY_SAVED", date: job.date, aiStatus: this.state.reports[job.date].aiStatus }));
      } catch (error) {
        if (this.storageFailed) throw error;
        await this.update((state) => {
          const current = state.reports[job.date];
          if (error.message === "DAILY_BUDGET_EXHAUSTED") {
            current.nextAttemptAt = this.now() + 3600000;
          } else {
            current.attempts++;
            if (current.attempts >= 3) {
              current.aiStatus = "unavailable";
              if (notify && current.snapshot) current.delivery ??= { status: "pending", environment, attempts: 0, nextAttemptAt: this.now() };
            }
            else current.nextAttemptAt = this.now() + 60000 * current.attempts;
          }
        });
        console.error(JSON.stringify({ event: "ORDER_DAILY_RETRY", date: job.date,
          reason: error.message === "DAILY_BUDGET_EXHAUSTED" ? "DAILY_BUDGET_EXHAUSTED" : "REPORT_UNAVAILABLE" }));
      }
    } finally { this.busy = false; }
  }
}
