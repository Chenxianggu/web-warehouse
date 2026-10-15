import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeLogData, redactText } from "../src/features/logs/sanitize";

test("redacts nested credentials and does not expose database error arguments", () => {
  const error = new Error('Invalid create({passwordHash:"hidden"}) postgresql://user:secret@localhost/db');
  const safe = sanitizeLogData({ passwordHash: "hash", nested: { authorization: "Bearer token", sessionVersion: 9 }, safe: "postgresql://user:secret@localhost/db", error, message: "password=abc token=def" });
  const text = JSON.stringify(safe);
  for (const secret of ['"hash"', '"Bearer token"', '"sessionVersion":9', 'user:secret', 'abc', 'def', 'Invalid create']) assert.equal(text.includes(secret), false, secret);
  assert.equal((safe as { error: { name: string } }).error.name, "Error");
});

test("cyclic, large and non-JSON metadata remain bounded and serializable", () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.doesNotThrow(() => JSON.stringify(sanitizeLogData(cycle)));
  assert.equal((sanitizeLogData(Array.from({ length: 1000 }, () => "x")) as string[]).length, 100);
  assert.equal((sanitizeLogData("x".repeat(10000)) as string).length, 4000);
  assert.equal(sanitizeLogData(BigInt("9007199254740993")), "9007199254740993");
  assert.equal(sanitizeLogData(new Date("2026-10-15T00:00:00Z")), "2026-10-15T00:00:00.000Z");
});

test("redacts connection addresses, bearer credentials and quoted secret assignments", () => {
  const value = redactText('postgresql://user:secret@host/db Bearer abcdef password="has spaces" token=123');
  for (const secret of ["user:secret", "abcdef", "has spaces", "123"]) assert.equal(value.includes(secret), false);
});
