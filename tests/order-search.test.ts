import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { orderSearchSchema, emptyOrderSearch } from "../src/features/order-search/schema";
import { getPrisma } from "../src/server/db";
import { searchCustomerOrders } from "../src/server/order-search";

test("search defaults to all orders and 20 rows, and trims fuzzy keywords", () => {
  const parsed = orderSearchSchema.parse({ orderNo: "  ABC  ", customer: "  客户  " });
  assert.equal(parsed.orderNo, "ABC");
  assert.equal(parsed.customer, "客户");
  assert.equal(parsed.startDate, "");
  assert.equal(parsed.endDate, "");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.pageSize, 20);
});

test("search rejects incomplete, reversed or impossible date ranges and unsupported page sizes", () => {
  for (const patch of [{ startDate: "2026-10-14" }, { endDate: "2026-10-14" }, { startDate: "2026-10-15", endDate: "2026-10-14" }, { startDate: "2026-02-30", endDate: "2026-03-01" }, { page: 0 }, { pageSize: 1000 }]) {
    assert.equal(orderSearchSchema.safeParse({ ...emptyOrderSearch, ...patch }).success, false, JSON.stringify(patch));
  }
  assert.ok(orderSearchSchema.safeParse({ startDate: "2026-10-14", endDate: "2026-10-14" }).success);
});

test("database search combines filters, includes both statuses, boundaries and stable pagination", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const marker = `search-test-${randomUUID().slice(0, 12)}`;
  try {
    await db.customerOrder.createMany({ data: Array.from({ length: 25 }, (_, index) => ({
      orderNo: `${marker}-${String(index + 1).padStart(3, "0")}`, customerCode: marker,
      customerName: index % 2 ? "测试客户甲" : "测试客户乙", receiver: "测试收货单位",
      orderDate: new Date(index === 0 ? "2094-10-13" : index === 24 ? "2094-10-16" : index % 2 ? "2094-10-14" : "2094-10-15"),
      isShipped: index % 2 === 0,
    })) });
    const base = { ...emptyOrderSearch, customer: marker, page: 1, pageSize: 20 as const };
    const all = await searchCustomerOrders(base);
    assert.equal(all.total, 25);
    assert.equal(all.data.length, 20);
    assert.ok(all.data.some((order) => order.isShipped));
    assert.ok(all.data.some((order) => !order.isShipped));
    const second = await searchCustomerOrders({ ...base, page: 2 });
    assert.equal(second.data.length, 5);
    assert.equal(new Set([...all.data, ...second.data].map((order) => order.id)).size, 25);
    const bounded = await searchCustomerOrders({ ...base, startDate: "2094-10-14", endDate: "2094-10-15", pageSize: 100 });
    assert.equal(bounded.total, 23);
    assert.ok(bounded.data.some((order) => order.orderDate === "2094-10-14"));
    assert.ok(bounded.data.some((order) => order.orderDate === "2094-10-15"));
    const byNumber = await searchCustomerOrders({ ...base, orderNo: `${marker.toUpperCase()}-001` });
    assert.equal(byNumber.total, 1);
    const byName = await searchCustomerOrders({ ...base, customer: "客户甲", orderNo: marker });
    assert.equal(byName.total, 12);
    assert.equal((await searchCustomerOrders({ ...base, orderNo: "does-not-exist" })).total, 0);
    assert.equal((await searchCustomerOrders({ ...base, page: 99, pageSize: 10 })).page, 3);
    assert.equal((await searchCustomerOrders({ ...base, orderNo: "-001", startDate: "2094-10-14", endDate: "2094-10-15" })).total, 0);
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: marker } });
    await db.$disconnect();
  }
});
