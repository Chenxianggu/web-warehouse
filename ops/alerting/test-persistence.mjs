// Isolated, network-disabled Compose fixture. Two different containers use the
// same volume to verify a failed delivery survives process/container replacement.
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { Outbox } from "./outbox.mjs";

const [phase, id] = process.argv.slice(2);
assert.match(id ?? "", /^verify-[a-f0-9]{12}$/);
const path = `/var/lib/warehouse-alerts/${id}.json`;
if (phase === "cleanup") {
  await rm(path, { force: true });
} else if (phase === "seed") {
  const box = await Outbox.open(path);
  await box.enqueue({ key: id, text: "隔离通知队列持久化验证" });
  await box.processOne(async () => { throw new Error("simulated channel outage"); });
  assert.equal(box.state.pending.length, 1);
  assert.equal(box.state.pending[0].attempts, 1);
  console.info("Failed delivery persisted in the first container.");
} else if (phase === "resume") {
  const box = await Outbox.open(path);
  assert.equal(box.state.pending.length, 1);
  assert.equal(box.state.pending[0].key, id);
  assert.equal(box.state.pending[0].attempts, 1);
  await setTimeout(Math.max(0, box.state.pending[0].nextAttemptAt - Date.now()));
  let delivered = 0;
  await box.processOne(async (text) => { assert.equal(text, "隔离通知队列持久化验证"); delivered += 1; });
  assert.equal(delivered, 1);
  const reloaded = await Outbox.open(path);
  assert.equal(reloaded.state.pending.length, 0);
  assert.ok(Number.isFinite(reloaded.state.sent[id]));
  console.info("Replacement container resumed and acknowledged the persisted delivery.");
} else {
  throw new Error("INVALID_VERIFICATION_PHASE");
}
