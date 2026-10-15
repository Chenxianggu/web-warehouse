import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { deleteCustomerRecord, updateCustomerRecord } from "../src/server/customer-directory";
import { readReceivableDetail } from "../src/server/receivables";

test("duplicate customer codes preserve records, shared addresses and historical orders", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const code = `dup-${randomUUID()}`, destination = `${code}-new`;
  try {
    const first = await db.customer.create({ data: { code, fullName: "历史客户名称" } });
    const second = await db.customer.create({ data: { code, fullName: "另一个客户名称" } });
    await db.receiverHistory.createMany({ data: [{ customerCode: code, receiver: "共享地址" }, { customerCode: destination, receiver: "共享地址" }] });
    await db.customerOrder.create({ data: { orderNo: code, customerCode: code, customerName: "订单历史姓名", receiver: "共享地址", orderDate: new Date("2097-01-01T00:00:00Z") } });
    assert.equal(await db.customer.count({ where: { code } }), 2);
    assert.equal((await readReceivableDetail(code)).customer.name, second.fullName);
    assert.equal(await updateCustomerRecord(first.id, destination, "改编号客户"), true);
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 1, "remaining duplicate retains shared address");
    assert.equal(await db.receiverHistory.count({ where: { customerCode: destination } }), 1, "overlapping addresses merge without failure");
    const third = await db.customer.create({ data: { code, fullName: "第三条档案" } });
    await deleteCustomerRecord(second.id);
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 1, "deleting one duplicate retains addresses");
    await deleteCustomerRecord(third.id);
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 0, "deleting the last directory entry clears its addresses");
    const order = await db.customerOrder.findUniqueOrThrow({ where: { orderNo: code } });
    assert.equal(order.customerCode, code);
    assert.equal(order.customerName, "订单历史姓名");
    assert.equal((await readReceivableDetail(code)).customer.name, "订单历史姓名");
    assert.equal(await updateCustomerRecord(first.id, code, "移回编号"), true);
    assert.equal(await db.receiverHistory.count({ where: { customerCode: destination } }), 0, "moving last entry transfers addresses");
    assert.equal(await db.receiverHistory.count({ where: { customerCode: code } }), 1);
  } finally {
    await db.customerOrder.deleteMany({ where: { orderNo: code } });
    await db.receiverHistory.deleteMany({ where: { customerCode: { in: [code, destination] } } });
    await db.customer.deleteMany({ where: { code: { in: [code, destination] } } });
    await db.$disconnect();
  }
});
