import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { collectDailySnapshot } from "../ops/agent/daily-source.mjs";

// A separate disposable database prevents business data, live audit history and
// current production-like role grants from being touched by fixture writes.
test("daily SQL totals, audit classification, precision, boundaries and aggregate-only permissions", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const suffix = randomBytes(6).toString("hex");
  const database = `rz_daily_test_${suffix}`; const role = `rz_daily_reader_${suffix}`;
  const password = randomBytes(24).toString("hex");
  const baseUrl = new URL(process.env.DATABASE_URL); baseUrl.search = "";
  const admin = new pg.Pool({ connectionString: baseUrl.toString(), max: 1 });
  let owner; let reader;
  try {
    await admin.query(`CREATE DATABASE ${database}`);
    const testUrl = new URL(baseUrl); testUrl.pathname = `/${database}`;
    const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: testUrl.toString() }, encoding: "utf8", timeout: 60000,
    });
    assert.equal(migration.status, 0, "disposable test database migrations must apply");
    owner = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });
    await owner.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password}'`);
    await owner.query(`ALTER ROLE ${role} SET default_transaction_read_only=on`);
    await owner.query(`GRANT USAGE ON SCHEMA reporting TO ${role}`);
    await owner.query(`GRANT SELECT ON reporting.customer_order_totals, reporting.order_activity_daily TO ${role}`);
    const readerUrl = new URL(testUrl); readerUrl.username = role; readerUrl.password = password;
    reader = new pg.Pool({ connectionString: readerUrl.toString(), max: 1 });

    await owner.query("INSERT INTO materials(code,name,packs_per_ton,updated_at) VALUES ('rpt-a','物料A',50,now()),('rpt-zero','物料零',40,now())");
    const order = async (number, code, date, shipped, items) => {
      const result = await owner.query("INSERT INTO orders(order_no,customer_code,customer_name,receiver,order_date,is_shipped,deduct_futures) VALUES($1,$2,$3,'private-address',$4,$5,false) RETURNING id", [number, code, `名称-${code}`, date, shipped]);
      const id = result.rows[0].id;
      for (const [material, packs, price] of items) await owner.query("INSERT INTO order_items(order_id,code,name,pack_count,unit_price,remark) VALUES($1,$2,$2,$3,$4,'private-remark')", [id, material, packs, price]);
      return id;
    };
    const first = await order("rpt-1", "client-a", "2098-11-22", false, [["rpt-a", 25, 10000], ["unknown-material", 20, 8000]]);
    await order("rpt-2", "client-b", "2098-11-22", true, [["rpt-zero", 10, 0]]);
    await order("rpt-old", "client-a", "2098-11-21", false, [["unknown-material", 40, 6000]]);
    await order("rpt-future", "client-a", "2098-11-23", false, [["rpt-a", 400, 10000]]);

    const audit = async (table, action, id, requestId, before, after, time = "2098-11-22T12:00:00+08:00") => owner.query(
      `INSERT INTO system_logs(category,level,status,module,action,entity_type,entity_id,actor_name,request_id,message,"before","after",created_at)
       VALUES('AUDIT','INFO','SUCCESS','日报测试',$1,$2,$3,'系统',$4,'测试',$5,$6,$7)`,
      [action, table, String(id), requestId, before, after, time]);
    await audit("orders", "INSERT", first, "create", null, { id: first, is_shipped: false });
    await audit("order_items", "INSERT", 1, "create", null, { order_id: first });
    await audit("order_items", "INSERT", 2, "create", null, { order_id: first });
    await audit("order_items", "DELETE", 1, "edit", { order_id: first }, null);
    await audit("order_items", "INSERT", 3, "edit", null, { order_id: first });
    await audit("orders", "UPDATE", first, "ship", { id: first, is_shipped: false }, { id: first, is_shipped: true });
    await audit("orders", "UPDATE", first, "unship", { id: first, is_shipped: true }, { id: first, is_shipped: false });
    await audit("orders", "INSERT", 999, "create-deleted", null, { id: 999 });
    await audit("orders", "DELETE", 999, "delete", { id: 999 }, null);
    await audit("order_items", "DELETE", 9999, "delete", { order_id: 999 }, null);
    await audit("order_items", "INSERT", 8888, null, null, { order_id: first });
    await audit("orders", "INSERT", 500, "midnight", null, { id: 500 }, "2098-11-22T00:00:00+08:00");
    await audit("orders", "INSERT", 501, "next-day", null, { id: 501 }, "2098-11-23T00:00:00+08:00");
    await audit("orders", "INSERT", 502, "prior-day", null, { id: 502 }, "2098-11-21T23:59:59.999+08:00");

    const report = await collectDailySnapshot(reader, "2098-11-22");
    assert.equal(report.totals.orders, "2"); assert.equal(report.totals.customers, "2");
    assert.equal(Number(report.totals.packs), 55); assert.equal(report.totals.tons, "1.250000"); assert.equal(report.totals.amount, "9000.00");
    assert.equal(report.totals.shippedOrders, "1"); assert.equal(report.totals.zeroPriceLines, "1");
    assert.equal(report.totals.defaultConversionLines, "1"); assert.equal(report.backlog.orders, "2"); assert.equal(report.backlog.amount, "15000.00");
    assert.equal(report.customers.find((row) => row.code === "client-a").metrics.amount, "9000.00");
    assert.equal(JSON.stringify(report).includes("private-address"), false); assert.equal(JSON.stringify(report).includes("private-remark"), false);
    assert.deepEqual(report.activity, { createdOrders: "3", deletedOrders: "1", modifiedOrders: "1", shipOperations: "1", unshipOperations: "1", unattributedItemEvents: "1" });

    // No multiplication with normalized duplicate material codes; choose latest
    // deterministic material row and flag the affected detail.
    await owner.query("INSERT INTO materials(code,name,packs_per_ton,updated_at) VALUES('RPT-A','同编号新资料',100,now())");
    const duplicate = await collectDailySnapshot(reader, "2098-11-22");
    assert.equal(duplicate.totals.amount, "6500.00"); assert.equal(duplicate.totals.orders, "2"); assert.equal(duplicate.totals.ambiguousMaterialLines, "1");
    await owner.query("INSERT INTO materials(code,name,packs_per_ton,updated_at) VALUES('precision','三包一吨',3,now())");
    await order("rpt-precision", "precise-client", "2098-11-24", false, [["precision", 1, "11111.11"], ["precision", 1, "11111.11"], ["precision", 1, "11111.11"]]);
    assert.equal((await collectDailySnapshot(reader, "2098-11-24")).totals.amount, "11111.11");

    for (const table of ["public.orders", "public.order_items", "public.users", "public.system_logs", "reporting.order_metrics"]) {
      await assert.rejects(reader.query(`SELECT * FROM ${table} LIMIT 0`), `reader must not access ${table}`);
    }
    await assert.rejects(reader.query("DELETE FROM public.orders WHERE false"));
    await assert.rejects(reader.query("UPDATE reporting.customer_order_totals SET customer_name='x' WHERE false"));
    await assert.rejects(collectDailySnapshot(reader, "2098-11-22';DROP TABLE orders;--"));
  } finally {
    await reader?.end(); await owner?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  }
});
