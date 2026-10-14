import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { persistCustomerOrder, readCustomerOrders, removeCustomerOrder } from "../src/server/customer-orders";

// Explicit opt-in: creates isolated, identifiable fixtures and removes them.
test("order persistence, numbering, receiver history and shipped protection", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const code = `orders-test-${randomUUID()}`;
  const date = "2098-11-22";
  const input = {
    id: null, customerCode: code, customerName: "订单集成测试", receiver: "手填收货单位", orderDate: date,
    deductFutures: true, items: [{ code, name: "手填塑料", packCount: 20, unitPrice: 8000, remark: "  备注  " }],
  };
  try {
    await db.material.create({ data: { code, name: "订单测试塑料", packsPerTon: 50 } });
    const results = await Promise.all(Array.from({ length: 6 }, () => persistCustomerOrder(input)));
    assert.ok(results.every((result) => result.ok));
    const ids = results.filter((result) => result.ok).map((result) => result.id);
    const numbers = results.filter((result) => result.ok).map((result) => result.orderNo);
    assert.equal(new Set(numbers).size, 6, "concurrent saves allocate unique order numbers");
    assert.ok(numbers.every((number) => number.startsWith("20981122")));
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 1, "history is deduplicated even for unregistered customers");
    const order = (await readCustomerOrders(date)).find((row) => row.id === ids[0]);
    assert.ok(order);
    assert.equal(order.orderDate, date);
    assert.equal(order.items[0].packsPerTon, 50);
    assert.equal(order.items[0].remark, "备注");
    assert.equal(order.deductFutures, true);
    assert.equal((await readCustomerOrders("2098-11-23")).some((row) => row.customerCode === code), false);

    const updated = await persistCustomerOrder({ ...input, id: ids[0], orderDate: "2098-11-23", receiver: "自提", deductFutures: false,
      items: [{ ...input.items[0], packCount: 10, unitPrice: 0 }, { ...input.items[0], code: `${code}-X`, packCount: 1 }] });
    assert.ok(updated.ok);
    assert.equal(updated.orderNo, order.orderNo, "editing the date preserves the original order number");
    const edited = (await readCustomerOrders("", ids[0]))[0];
    assert.equal(edited.items.length, 2);
    assert.equal(edited.items[0].unitPrice, 0);
    assert.equal(edited.items[1].packsPerTon, 40, "manual material codes use the default conversion");
    assert.equal(edited.deductFutures, false);
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 2);

    await db.customerOrder.update({ where: { id: ids[0] }, data: { isShipped: true } });
    assert.equal((await persistCustomerOrder({ ...input, id: ids[0] })).ok, false);
    assert.equal((await removeCustomerOrder(ids[0])).ok, false);
    assert.equal((await readCustomerOrders("", ids[0]))[0].receiver, "自提");
    assert.equal((await removeCustomerOrder(ids[1])).ok, true);
    assert.equal(await db.customerOrderItem.count({ where: { orderId: ids[1] } }), 0, "deleting an order cascades to its items");
    assert.equal((await removeCustomerOrder(ids[1])).ok, false);

    const before = await db.customerOrder.count({ where: { customerCode: code } });
    assert.equal((await persistCustomerOrder({ ...input, items: [{ ...input.items[0], packCount: 0 }] })).ok, false);
    assert.equal(await db.customerOrder.count({ where: { customerCode: code } }), before);
    await assert.rejects(() => readCustomerOrders("2098-02-30"));

    await db.customerOrder.create({ data: { orderNo: "20981124999", customerCode: code, customerName: "订单集成测试", receiver: "自提", orderDate: new Date("2098-11-24T00:00:00Z") } });
    const thousand = await persistCustomerOrder({ ...input, orderDate: "2098-11-24" });
    const thousandAndOne = await persistCustomerOrder({ ...input, orderDate: "2098-11-24" });
    assert.ok(thousand.ok && thousandAndOne.ok);
    assert.equal(thousand.orderNo, "209811241000");
    assert.equal(thousandAndOne.orderNo, "209811241001");
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: code } });
    await db.receiverHistory.deleteMany({ where: { customerCode: code } });
    await db.material.deleteMany({ where: { code } });
    await db.$disconnect();
  }
});
