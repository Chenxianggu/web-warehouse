import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { validTask } from "./analysis.mjs";

export async function readState(path) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    if (state.version !== 1 || !Array.isArray(state.pending) || !state.sent || typeof state.sent !== "object" || Array.isArray(state.sent)
      || Object.values(state.sent).some((value) => !Number.isFinite(value))
      || (state.dailySent !== undefined && (!state.dailySent || typeof state.dailySent !== "object" || Array.isArray(state.dailySent)
        || Object.values(state.dailySent).some((value) => !Number.isFinite(value))))
      || state.pending.some((item) => !item || typeof item.id !== "string" || typeof item.key !== "string" || typeof item.text !== "string"
        || !Number.isFinite(item.createdAt) || !Number.isFinite(item.nextAttemptAt) || !Number.isInteger(item.attempts) || item.attempts < 0)
      || (state.analysis !== undefined && (!Array.isArray(state.analysis.pending) || !Number.isInteger(state.analysis.dropped)
        || state.analysis.pending.some((item) => !validTask(item.task) || !Number.isInteger(item.attempts) || item.attempts < 0 || !Number.isFinite(item.nextAttemptAt))))) throw new Error("INVALID_STATE");
    return state;
  } catch (error) {
    if (error.code === "ENOENT") return { version: 1, pending: [], sent: {}, monitor: null };
    throw error; // A corrupt state must never silently erase unsent notifications.
  }
}

export async function writeState(path, state) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  const file = await open(temporary, "w", 0o600);
  try { await file.writeFile(JSON.stringify(state)); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  if (process.platform !== "win32") {
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  }
}

// One process owns one state file. API requests and worker commits serialize;
// network delivery happens outside the lock so reception stays responsive.
export class Outbox {
  constructor(path, state, { now = Date.now, cooldownMs = 300000, limit = 1000 } = {}) {
    this.path = path; this.state = state; this.now = now; this.cooldownMs = cooldownMs; this.limit = limit;
    this.tail = Promise.resolve(); this.busy = false; this.storageFailed = false;
  }
  static async open(path, options) { return new Outbox(path, await readState(path), options); }
  async update(fn) {
    const operation = this.tail.then(async () => {
      const next = structuredClone(this.state);
      const result = fn(next);
      try { await writeState(this.path, next); this.storageFailed = false; } catch (error) { this.storageFailed = true; throw error; }
      this.state = next;
      return result;
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  async enqueue(notice, monitor, analysis = null) {
    return this.update((state) => {
      const now = this.now();
      if (monitor !== undefined) state.monitor = monitor;
      if (analysis) {
        if (!validTask(analysis)) throw new Error("INVALID_ANALYSIS_TASK");
        state.analysis ??= { pending: [], dropped: 0 };
        if (!state.analysis.pending.some((item) => item.task.key === analysis.key)) {
          // Analysis saturation must never block the original mobile alert.
          if (state.analysis.pending.length >= 100) state.analysis.dropped += 1;
          else state.analysis.pending.push({ task: analysis, attempts: 0, nextAttemptAt: now });
        }
      }
      state.sent = Object.fromEntries(Object.entries(state.sent).filter(([, time]) => now - time < 86400000));
      if (state.dailySent) state.dailySent = Object.fromEntries(Object.entries(state.dailySent).filter(([, time]) => now - time < 180 * 86400000));
      if (!notice) return "state-only";
      if (notice.kind === "order-daily" && state.dailySent?.[notice.key] !== undefined) return "duplicate";
      if (state.pending.some((item) => item.key === notice.key) || (state.sent[notice.key] !== undefined && now - state.sent[notice.key] < this.cooldownMs)) return "duplicate";
      if (state.pending.length >= this.limit) throw new Error("OUTBOX_FULL");
      state.pending.push({ id: randomUUID(), ...notice, attempts: 0, createdAt: now, nextAttemptAt: now });
      return "queued";
    });
  }
  health(configured) {
    const oldest = this.state.pending[0];
    const ok = configured && !this.storageFailed && (!oldest || this.now() - oldest.createdAt < 900000);
    return { ok, configured, pending: this.state.pending.length, storageFailed: this.storageFailed,
      analysisPending: this.state.analysis?.pending.length ?? 0, analysisDropped: this.state.analysis?.dropped ?? 0 };
  }
  dailyStatus(key) {
    const deliveredAt = this.state.dailySent?.[key];
    if (deliveredAt !== undefined) return { status: "delivered", deliveredAt };
    return { status: this.state.pending.some((item) => item.key === key) ? "queued" : "missing" };
  }
  async forwardOne(send) {
    if (this.analysisBusy) return;
    this.analysisBusy = true;
    try {
      const item = this.state.analysis?.pending[0];
      if (!item || this.now() < item.nextAttemptAt) return;
      let delivered = false;
      const expired = this.now() - item.task.receivedAt > 86400000;
      if (!expired) { try { await send(item.task); delivered = true; } catch { /* Retry independently of mobile delivery. */ } }
      await this.update((state) => {
        const current = state.analysis.pending[0];
        if (current.task.key !== item.task.key) throw new Error("ANALYSIS_ORDER_CHANGED");
        if (delivered || expired) {
          state.analysis.pending.shift();
          if (expired) state.analysis.dropped += 1;
        } else {
          current.attempts += 1;
          current.nextAttemptAt = this.now() + Math.min(300000, 5000 * 2 ** Math.min(current.attempts - 1, 6));
        }
      });
    } finally { this.analysisBusy = false; }
  }
  async processOne(send) {
    if (this.busy) return;
    this.busy = true;
    try {
      const item = this.state.pending[0];
      if (!item || this.now() < item.nextAttemptAt) return;
      let sent = false;
      try { await send(item.text); sent = true; } catch { /* Persist failure without logging provider payloads or URLs. */ }
      await this.update((state) => {
        const current = state.pending[0];
        if (current?.id !== item.id) throw new Error("OUTBOX_ORDER_CHANGED");
        if (sent) {
          state.pending.shift(); state.sent[item.key] = this.now();
          if (item.kind === "order-daily") { state.dailySent ??= {}; state.dailySent[item.key] = this.now(); }
          const entries = Object.entries(state.sent).sort((a, b) => b[1] - a[1]).slice(0, 2000);
          state.sent = Object.fromEntries(entries);
        } else {
          current.attempts += 1;
          current.nextAttemptAt = this.now() + Math.min(300000, 5000 * 2 ** Math.min(current.attempts - 1, 6));
        }
      });
      console.info(JSON.stringify({ event: sent ? "ALERT_DELIVERED" : "ALERT_RETRY_SCHEDULED", notificationId: item.key, status: item.status ?? null, reportDate: item.reportDate ?? null, verificationId: item.verificationId ?? null, pending: this.state.pending.length }));
    } finally { this.busy = false; }
  }
}
