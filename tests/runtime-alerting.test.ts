import assert from "node:assert/strict";
import { test } from "node:test";
import { healthResponse } from "../src/server/health";
import { PrismaClient } from "../src/generated/prisma/client";
import { auditTransaction, businessTransaction } from "../src/server/audit";
import { isDatabaseUnavailable, isExpectedDatabaseError, reportRuntimeError } from "../src/server/runtime-errors";

test("health checks execute every time, never cache or disclose DB details", async () => {
  let calls = 0;
  const check = async () => { calls += 1; };
  const good = await healthResponse(check); await healthResponse(check);
  assert.equal(calls, 2); assert.equal(good.status, 200);
  assert.match(good.headers.get("Cache-Control") ?? "", /no-store/);
  const bad = await healthResponse(async () => { throw new Error("postgresql://user:secret@db/internal"); });
  assert.equal(bad.status, 503); assert.deepEqual(await bad.json(), { status: "unavailable" });
});

test("connection errors and expected constraints are classified using structured codes", () => {
  for (const code of ["P1001", "P1017", "ECONNREFUSED", "08006"]) assert.equal(isDatabaseUnavailable({ code }), true);
  assert.equal(isDatabaseUnavailable({ cause: { code: "ECONNRESET" } }), true);
  assert.equal(isDatabaseUnavailable({ code: "P2010", meta: { driverAdapterError: { cause: { kind: "DatabaseNotReachable" } } } }), true);
  for (const code of ["P2002", "P2003", "P2025"]) assert.equal(isExpectedDatabaseError({ code }), true);
  assert.equal(isExpectedDatabaseError({ code: "P2034" }), false);
  assert.equal(isDatabaseUnavailable(new Error("password=secret connection failed")), false);
});

test("failed business transactions log once with shared correlation ID and sanitized error", async (t) => {
  const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };
  const original = globalForPrisma.prisma;
  const client = Object.create(PrismaClient.prototype) as PrismaClient;
  globalForPrisma.prisma = client;
  t.after(() => { globalForPrisma.prisma = original; });
  const output: string[] = []; let auditId: unknown;
  t.mock.method(console, "error", (line: string) => output.push(line));
  const error = Object.assign(new Error("private SQL password=secret"), { code: "P1001" });
  client.$transaction = (async (work: (tx: unknown) => Promise<unknown>) => work({
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => { auditId = values[2]; },
  })) as typeof client.$transaction;
  await assert.rejects(businessTransaction("客户订单")(undefined, async () => { throw error; }), (caught) => caught === error);
  await reportRuntimeError(error, { module: "系统运行", action: "REQUEST_ERROR" });
  assert.equal(output.length, 1);
  const entry = JSON.parse(output[0]);
  assert.equal(entry.requestId, auditId); assert.equal(entry.module, "客户订单"); assert.equal(entry.action, "DATABASE_UNAVAILABLE");
  assert.ok(!output[0].includes("private SQL")); assert.ok(!output[0].includes("secret"));
  const expected = Object.assign(new Error("constraint"), { code: "P2002" });
  await assert.rejects(auditTransaction(undefined, async () => { throw expected; }));
  assert.equal(output.length, 1);
  assert.deepEqual(await auditTransaction(undefined, async () => ({ ok: false, message: "普通校验失败" })), { ok: false, message: "普通校验失败" });
  assert.equal(output.length, 1);
  await reportRuntimeError({ code: "ECONNRESET", message: "private SQL password=secret", originalMessage: "private SQL", meta: { sql: "private SQL" } }, { module: "系统运行", action: "REQUEST_ERROR" });
  assert.equal(output.length, 2);
  assert.ok(!output[1].includes("private SQL")); assert.ok(!output[1].includes("secret"));
});
