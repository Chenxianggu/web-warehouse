import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { readReceivables, readReceivableDetail, persistReceivablePayment, removeReceivablePayment } from "../src/server/receivables";
import { fullContainerCode } from "../src/features/receivables/ledger";

test("real ledger reads orders/materials/containers, persists payments and reverses deletions", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const code = `rv-${randomUUID()}`;
  const name = `应收测试-${code}`, registeredBuyer = `整柜测试-${code}`, newBuyer = `新 买方-${code}`;
  const codes = [code, `${code}-C`, fullContainerCode(newBuyer)];
  const day = new Date("2097-10-14T00:00:00Z");
  const containerBase = { orderDate: day, itemName: "测试整柜", quantity: 1, supplier: "测试供方" };
  try {
    await db.customer.createMany({ data: [{ code, fullName: name }, { code: codes[1], fullName: registeredBuyer }] });
    await db.material.create({ data: { code, name: "测试塑料", packsPerTon: 50 } });
    await db.customerOrder.create({ data: { orderNo: `rv1-${code}`, orderDate: day, customerCode: code, customerName: name, receiver: "自提", isShipped: false,
      items: { create: [{ code: ` ${code} `, name: "测试塑料", packCount: 20, unitPrice: 8000 }, { code: `${code}-M`, name: "手填", packCount: 3, unitPrice: 100 }] } } });
    await db.customerOrder.create({ data: { orderNo: `rv2-${code}`, orderDate: new Date("2097-10-15T00:00:00Z"), customerCode: code, customerName: name, receiver: "自提", isShipped: true,
      items: { create: [{ code, name: "测试塑料", packCount: 10, unitPrice: 8000 }] } } });
    await db.fullContainerRecord.createMany({ data: [
      { ...containerBase, buyer: name, amount: 1000, warehouseOnArrival: true },
      { ...containerBase, buyer: name, amount: 2000, warehouseOnArrival: false },
      { ...containerBase, buyer: registeredBuyer, amount: 900 },
      { ...containerBase, buyer: newBuyer, amount: 500 },
    ] });
    let detail = await readReceivableDetail(code);
    assert.equal(detail.totalAmount, 7807.5);
    assert.equal(detail.orders.length, 4, "both warehouse modes and unshipped orders count");
    assert.equal(detail.orders[0].orderDate, "2097-10-15");
    const initial = await readReceivables();
    assert.equal(initial.rows.find((row) => row.customerCode === code)?.totalAmount, detail.totalAmount);
    assert.equal(initial.rows.find((row) => row.customerCode === codes[1])?.totalAmount, 900);
    assert.equal(initial.rows.find((row) => row.customerCode === codes[2])?.totalAmount, 500);
    assert.equal((await readReceivableDetail(codes[2])).orders[0].orderNo, "整柜-测试整柜");

    const input = { customerCode: code, customerName: name, amount: 8000.01, paymentDate: "2097-10-16", remark: "  超额支付  " };
    const payment = await persistReceivablePayment(input);
    assert.ok(payment.ok);
    detail = await readReceivableDetail(code);
    assert.equal(detail.paidAmount, 8000.01);
    assert.equal(detail.receivableAmount, -192.51);
    assert.equal(detail.payments[0].remark, "超额支付");
    assert.equal(detail.payments[0].paymentDate, "2097-10-16");
    assert.equal((await readReceivables()).rows.find((row) => row.customerCode === code)?.receivableAmount, -192.51);
    const second = await persistReceivablePayment({ ...input, amount: 1.01, paymentDate: "2097-10-15" });
    assert.ok(second.ok);
    assert.equal((await readReceivableDetail(code)).payments[0].id, payment.id, "latest payment date sorts first");
    assert.equal((await removeReceivablePayment(payment.id)).ok, true);
    assert.equal((await removeReceivablePayment(payment.id)).ok, false);
    assert.equal((await removeReceivablePayment(second.id)).ok, true);
    assert.equal((await readReceivableDetail(code)).receivableAmount, 7807.5);
    assert.equal((await persistReceivablePayment({ ...input, amount: -10 })).ok, false);
    assert.equal((await persistReceivablePayment({ ...input, paymentDate: "2097-02-30" })).ok, false);
    assert.equal((await removeReceivablePayment(-1)).ok, false);

    const synthetic = await persistReceivablePayment({ ...input, customerCode: codes[2], customerName: newBuyer, amount: 125 });
    assert.ok(synthetic.ok);
    assert.equal((await readReceivableDetail(codes[2])).receivableAmount, 375);
    await db.customer.delete({ where: { code } });
    assert.equal((await readReceivableDetail(code)).customer.name, name, "deleted customer uses historical name");
    await db.material.update({ where: { code }, data: { packsPerTon: 40 } });
    assert.equal((await readReceivableDetail(code)).totalAmount, 9007.5, "conversion follows current material master");
  } finally {
    await db.receivablePayment.deleteMany({ where: { customerCode: { in: codes } } });
    await db.customerOrder.deleteMany({ where: { customerCode: code } });
    await db.fullContainerRecord.deleteMany({ where: { buyer: { in: [name, registeredBuyer, newBuyer] } } });
    await db.customer.deleteMany({ where: { code: { in: codes } } });
    await db.material.deleteMany({ where: { code } });
    await db.$disconnect();
  }
});
