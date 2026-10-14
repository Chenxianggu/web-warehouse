import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { readConsignments, persistConsignment, removeConsignment } from "../src/server/consignments";
import { persistCustomerOrder } from "../src/server/customer-orders";
import { shipCustomerOrder, unshipCustomerOrder } from "../src/server/outbound-orders";
import { emptyFilter } from "../src/features/consignments/schema";

test("consignment CRUD, receipt, filters and shipping share consistent history without altering inbound stock", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const marker = `cstest-${randomUUID().slice(0, 12)}`;
  const input = { id: null, updatedAt: null, orderDate: "2098-01-01", customerName: marker, itemCode: marker, quantity: 20, unitPrice: 8000, arrivalDate: "2000-01-01", storageFeePrice: .5, storageFeeDays: 7, status: "unfinished", remark: "寄存测试", outboundHistory: [] };
  try {
    await db.material.create({ data: { code: marker, name: marker, packsPerTon: 50 } });
    const saved = await persistConsignment(input); assert.ok(saved.ok);
    let page = await readConsignments({ ...emptyFilter, customerName: marker, date: input.orderDate, arrivalDate: input.arrivalDate, status: "finished", page: 99 });
    assert.equal(page.total, 1); assert.equal(page.page, 1);
    const row = page.data[0]; assert.equal(row.storageFeeTotal, 70); assert.equal(row.amount, 160000);
    assert.equal(await db.inboundRecord.count({ where: { code: marker } }), 0);
    const updated = await persistConsignment({ ...row, outboundHistory: [{ date: "2000-01-06", quantity: 5 }] }); assert.ok(updated.ok);
    assert.equal((await persistConsignment(row)).ok, false, "stale edits must fail");
    const order = await persistCustomerOrder({ id: null, customerCode: marker, customerName: marker, receiver: "自提", orderDate: "2000-01-11", deductFutures: true, items: [{ code: marker, name: marker, packCount: 500, unitPrice: 0, remark: "" }] }); assert.ok(order.ok);
    assert.ok((await shipCustomerOrder(order.id)).ok);
    page = await readConsignments({ ...emptyFilter, customerName: marker });
    const shipped = page.data[0]; assert.equal(shipped.outboundQuantity, 15); assert.equal(shipped.outboundHistory.length, 2);
    assert.equal((await removeConsignment(row.id, row.updatedAt)).ok, false, "stale deletion must fail");
    assert.ok((await persistConsignment({ ...shipped, remark: "更新备注" })).ok, "editing preserves linked history regardless of JSON key ordering");
    const fresh = (await readConsignments({ ...emptyFilter, customerName: marker })).data[0];
    const blocked = await persistConsignment({ ...fresh, outboundHistory: [] });
    assert.ok(!blocked.ok); assert.match(blocked.message, /订单关联/);
    assert.ok((await unshipCustomerOrder(order.id)).ok);
    page = await readConsignments({ ...emptyFilter, customerName: marker });
    assert.equal(page.data[0].outboundQuantity, 5); assert.deepEqual(page.data[0].outboundHistory, [{ date: "2000-01-06", quantity: 5 }]);
    assert.equal((await readConsignments({ ...emptyFilter, customerName: marker, status: "unfinished" })).total, 0);
    assert.ok((await removeConsignment(row.id, page.data[0].updatedAt)).ok);
    await db.customerConsignment.createMany({ data: Array.from({ length: 11 }, () => ({ orderDate: new Date(input.orderDate), customerName: marker, itemCode: marker, quantity: 1 })) });
    const second = await readConsignments({ ...emptyFilter, customerName: marker, itemCode: marker, page: 2 });
    assert.equal(second.total, 11); assert.equal(second.data.length, 1);
    assert.equal((await readConsignments({ ...emptyFilter, customerName: marker }, true)).data.length, 11);
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: marker } });
    await db.receiverHistory.deleteMany({ where: { customerCode: marker } });
    await db.customerConsignment.deleteMany({ where: { customerName: marker } });
    await db.inboundRecord.deleteMany({ where: { code: marker } });
    await db.material.deleteMany({ where: { code: marker } });
    await db.$disconnect();
  }
});
