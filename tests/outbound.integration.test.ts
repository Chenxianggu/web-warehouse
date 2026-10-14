import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { persistCustomerOrder } from "../src/server/customer-orders";
import { readOutboundOrders, shipCustomerOrder, unshipCustomerOrder } from "../src/server/outbound-orders";

test("shipping and reversal keep stock, consignments and order state consistent", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const marker = `obtest-${randomUUID().slice(0, 14)}`;
  const code = `${marker}-A`;
  const absent = `${marker}-B`;
  const customer = `出库测试-${marker}`;
  const date = "2097-10-14";
  const input = { id: null, customerCode: marker, customerName: customer, receiver: "自提", orderDate: date, deductFutures: true,
    items: [{ code, name: "塑料A", packCount: 20, unitPrice: 8000, remark: "" }, { code, name: "塑料A", packCount: 15, unitPrice: 8000, remark: "" }, { code: absent, name: "塑料B", packCount: 10, unitPrice: 0, remark: "" }] };
  async function stock(materialCode: string) { return Number((await db.inboundRecord.aggregate({ where: { code: materialCode }, _sum: { packCount: true } }))._sum.packCount || 0); }
  try {
    await db.material.create({ data: { code, name: "测试塑料", packsPerTon: 50 } });
    const first = await db.inboundRecord.create({ data: { code, name: "塑料A", packCount: 30, inboundUnitPrice: 2000, createdAt: new Date("2090-01-01") } });
    const second = await db.inboundRecord.create({ data: { code, name: "塑料A", packCount: 20, inboundUnitPrice: 3000, createdAt: new Date("2090-01-02") } });
    const large = await db.customerConsignment.create({ data: { orderDate: new Date(date), customerName: customer, itemCode: code, quantity: 2, status: "finished" } });
    const best = await db.customerConsignment.create({ data: { orderDate: new Date(date), customerName: customer, itemCode: code, quantity: .8, status: "finished" } });
    const unfinished = await db.customerConsignment.create({ data: { orderDate: new Date(date), customerName: customer, itemCode: absent, quantity: 10, status: "unfinished" } });
    const saved = await persistCustomerOrder(input);
    assert.ok(saved.ok);
    const shipped = await shipCustomerOrder(saved.id);
    assert.ok(shipped.ok);
    assert.equal(shipped.warnings.length, 1);
    assert.equal(await stock(code), 15);
    assert.equal(await stock(absent), -10);
    assert.equal(Number((await db.inboundRecord.findUniqueOrThrow({ where: { id: first.id } })).packCount), 0);
    assert.equal(Number((await db.inboundRecord.findUniqueOrThrow({ where: { id: second.id } })).packCount), 15);
    assert.equal(Number((await db.customerConsignment.findUniqueOrThrow({ where: { id: large.id } })).outboundQuantity), 0);
    assert.equal(Number((await db.customerConsignment.findUniqueOrThrow({ where: { id: best.id } })).outboundQuantity), .7);
    assert.equal(Number((await db.customerConsignment.findUniqueOrThrow({ where: { id: unfinished.id } })).outboundQuantity), 0);
    assert.equal((await shipCustomerOrder(saved.id)).ok, false, "repeated shipping must not deduct twice");
    await db.material.update({ where: { code }, data: { packsPerTon: 40 } });
    assert.equal((await unshipCustomerOrder(saved.id)).ok, true);
    assert.equal(await stock(code), 50);
    assert.equal(await stock(absent), 0);
    assert.equal(Number((await db.customerConsignment.findUniqueOrThrow({ where: { id: best.id } })).outboundQuantity), 0, "reversal uses the actual deduction, even after conversion changes");
    assert.deepEqual((await db.customerConsignment.findUniqueOrThrow({ where: { id: best.id } })).outboundHistory, []);
    assert.equal((await unshipCustomerOrder(saved.id)).ok, false);

    const [a, b] = await Promise.all([1, 2].map(() => persistCustomerOrder({ ...input, deductFutures: false, items: [{ ...input.items[0], packCount: 30 }] })));
    assert.ok(a.ok && b.ok);
    const concurrent = await Promise.all([shipCustomerOrder(a.id), shipCustomerOrder(a.id), shipCustomerOrder(b.id)]);
    assert.equal(concurrent.filter((result) => result.ok).length, 2);
    assert.equal(await stock(code), -10, "different orders with the same material share a stock lock");
    await Promise.all([unshipCustomerOrder(a.id), unshipCustomerOrder(b.id)]);
    assert.equal(await stock(code), 50);

    const empty = await db.customerOrder.create({ data: { orderNo: `${marker}-empty`, customerCode: marker, customerName: customer, receiver: "自提", orderDate: new Date(date) } });
    await assert.rejects(() => shipCustomerOrder(empty.id), /订单明细为空/);
    assert.equal((await db.customerOrder.findUniqueOrThrow({ where: { id: empty.id } })).isShipped, false, "transaction failure rolls back order state");
    for (let index = 0; index < 9; index++) await persistCustomerOrder({ ...input, deductFutures: false, items: [input.items[0]] });
    const page = await readOutboundOrders({ isShipped: false, date, customer: marker, page: 99, pageSize: 10 });
    assert.equal(page.total, 13);
    assert.equal(page.page, 2);
    assert.equal(page.data.length, 3);
    const noMatches = await readOutboundOrders({ isShipped: false, date: "2097-10-15", customer: marker, page: 1, pageSize: 10 });
    assert.equal(noMatches.total, 0);
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: marker } });
    await db.receiverHistory.deleteMany({ where: { customerCode: marker } });
    await db.customerConsignment.deleteMany({ where: { customerName: customer } });
    await db.inboundRecord.deleteMany({ where: { code: { in: [code, absent] } } });
    await db.material.deleteMany({ where: { code } });
    await db.$disconnect();
  }
});
