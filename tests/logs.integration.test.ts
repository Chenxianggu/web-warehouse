import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { auditTransaction } from "../src/server/audit";
import { writeLog } from "../src/server/logger";
import { onRequestError } from "../src/instrumentation";

test("audit snapshots, atomic rollback, identity isolation, cascades, redaction and append-only storage", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const marker = `logs-test-${randomUUID()}`;
  const actor = { id: marker, username: "日志测试员" };
  let userId: string | undefined;
  try {
    const material = await auditTransaction(actor, (tx) => tx.material.create({ data: { code: marker, name: "日志测试" } }));
    const inserted = await db.systemLog.findFirstOrThrow({ where: { actorId: marker, entityType: "materials", entityId: String(material.id) } });
    assert.equal(inserted.action, "INSERT"); assert.equal(inserted.actorName, actor.username); assert.equal(inserted.before, null);
    assert.equal((inserted.after as { code: string }).code, marker);
    await auditTransaction(actor, (tx) => tx.material.updateMany({ where: { id: material.id }, data: { name: "批量更新后" } }));
    const updated = await db.systemLog.findFirstOrThrow({ where: { actorId: marker, action: "UPDATE" }, orderBy: { id: "desc" } });
    assert.equal((updated.before as { name: string }).name, "日志测试"); assert.equal((updated.after as { name: string }).name, "批量更新后");
    const count = await db.systemLog.count({ where: { actorId: marker } });
    await assert.rejects(auditTransaction(actor, async (tx) => { await tx.material.update({ where: { id: material.id }, data: { name: "必须回滚" } }); throw new Error("rollback"); }));
    assert.equal((await db.material.findUniqueOrThrow({ where: { id: material.id } })).name, "批量更新后");
    assert.equal(await db.systemLog.count({ where: { actorId: marker } }), count);
    await auditTransaction(actor, (tx) => tx.material.update({ where: { id: material.id }, data: { name: "批量更新后" } }));
    assert.equal(await db.systemLog.count({ where: { actorId: marker } }), count, "no-op updates are suppressed");
    await assert.rejects(auditTransaction({ id: marker, username: "x".repeat(101) }, (tx) => tx.material.create({ data: { code: `${marker}-fail`, name: "审计失败必须回滚业务" } })));
    assert.equal(await db.material.count({ where: { code: `${marker}-fail` } }), 0);
    await Promise.all([auditTransaction(actor, (tx) => tx.material.update({ where: { id: material.id }, data: { name: "用户操作" } })), db.material.create({ data: { code: `${marker}-system`, name: "系统操作" } })]);
    const system = await db.systemLog.findFirstOrThrow({ where: { entityType: "materials", after: { path: ["code"], equals: `${marker}-system` } } });
    assert.equal(system.actorId, null); assert.equal(system.actorName, "系统"); assert.equal(system.requestId, null);
    const user = await auditTransaction(actor, (tx) => tx.user.create({ data: { username: marker, passwordHash: "must-never-be-logged", sessionVersion: 3 } }));
    userId = user.id;
    await auditTransaction(actor, (tx) => tx.user.update({ where: { id: user.id }, data: { passwordHash: "another-secret", sessionVersion: 4 } }));
    const credentials = await db.systemLog.findMany({ where: { entityType: "users", entityId: user.id } });
    assert.ok(credentials.some((r) => r.action === "PASSWORD_CHANGE"));
    for (const row of credentials) { assert.equal(JSON.stringify(row.after).includes("password_hash"), false); assert.equal(JSON.stringify(row.after).includes("session_version"), false); }
    const order = await auditTransaction(actor, (tx) => tx.customerOrder.create({ data: { orderNo: marker, customerCode: marker, customerName: marker, receiver: marker, orderDate: new Date(), items: { create: { code: marker, name: marker, packCount: 1 } } } }));
    await auditTransaction(actor, (tx) => tx.customerOrder.delete({ where: { id: order.id } }));
    assert.ok(await db.systemLog.findFirst({ where: { actorId: marker, entityType: "order_items", action: "DELETE" } }), "cascade is audited");
    const orderLogs = await db.systemLog.findMany({ where: { actorId: marker, action: "DELETE", entityType: { in: ["orders", "order_items"] } } });
    assert.equal(new Set(orderLogs.map((r) => r.requestId)).size, 1, "one transaction shares a correlation ID");
    await writeLog({ category: "AUTH", level: "WARN", status: "FAILURE", module: "登录认证", action: "LOGIN_FAILED", message: "测试登录失败", actor, metadata: { password: "never-log-me", error: new Error("secret SQL") } });
    const failed = await db.systemLog.findFirstOrThrow({ where: { actorId: marker, action: "LOGIN_FAILED" } });
    assert.equal(JSON.stringify(failed.metadata).includes("never-log-me"), false);
    await assert.rejects(db.systemLog.delete({ where: { id: inserted.id } }));
    await assert.rejects(db.systemLog.update({ where: { id: inserted.id }, data: { message: "篡改" } }));
    const oldRuntime = process.env.NEXT_RUNTIME;
    const originalError = console.error;
    const runtimeOutput: string[] = [];
    const runtimeCount = await db.systemLog.count({ where: { category: "SYSTEM" } });
    try {
      console.error = (value: string) => { runtimeOutput.push(value); };
      process.env.NEXT_RUNTIME = "nodejs";
      await onRequestError(new Error("must-not-log-raw-error"), { path: `/logs-probe/${marker}?password=never-log-me`, method: "POST", headers: { authorization: "Bearer never-log-me" } }, { routerKind: "App Router", routePath: "/logs-probe/[id]", routeType: "route", revalidateReason: undefined });
      const runtime = JSON.parse(runtimeOutput[0]);
      assert.equal(runtime.level, "ERROR"); assert.equal(runtime.status, "FAILURE");
      assert.equal(runtime.metadata.path, `/logs-probe/${marker}`);
      assert.equal(JSON.stringify(runtime.metadata).includes("never-log-me"), false);
      assert.equal(await db.systemLog.count({ where: { category: "SYSTEM" } }), runtimeCount, "runtime errors never depend on database log storage");
    } finally {
      console.error = originalError;
      if (oldRuntime === undefined) delete process.env.NEXT_RUNTIME; else process.env.NEXT_RUNTIME = oldRuntime;
    }
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: marker } });
    await db.material.deleteMany({ where: { code: { startsWith: marker } } });
    if (userId) await db.user.delete({ where: { id: userId } });
    // Remove only this test's records, including default-system cleanup records.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('rz.log_maintenance', 'on', true)`;
      await tx.systemLog.deleteMany({ where: { OR: [{ actorId: marker }, { metadata: { path: ["path"], equals: `/logs-probe/${marker}` } }, { after: { path: ["code"], string_starts_with: marker } }, { before: { path: ["code"], string_starts_with: marker } }, ...(userId ? [{ entityType: "users", entityId: userId }] : [])] } });
    });
    await db.$disconnect();
  }
});
