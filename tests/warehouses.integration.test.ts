import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { persistCustomerOrder, readCustomerOrders } from "../src/server/customer-orders";
import { shipCustomerOrder, unshipCustomerOrder } from "../src/server/outbound-orders";
import { persistPurchaseOrder, readPurchaseOrders, addPurchaseDelivery, removePurchaseDelivery } from "../src/server/purchase-orders";
import { emptyPurchaseFilter } from "../src/features/purchase-orders/schema";
import { summarizeStock } from "../src/features/inventory/stock";

test("receipts, whole and scheduled purchase arrivals, shipments and reversals stay in their warehouse", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma();
  const marker = `whtest-${randomUUID().slice(0, 12)}`;
  const code = marker + "-A";
  const absent = marker + "-B";
  const filter = { ...emptyPurchaseFilter, supplier: marker };
  const purchase = { id: null, updatedAt: null, orderDate: "2098-01-01", supplier: marker, itemCode: code, category: "", quantity: 2, unitPrice: 8000, taxIncluded: false, warehouse: "HONGHAI", remittanceInCompany: "", remittanceOutCompany: "", remittanceDate: "", arrivalDate: "", deliveryInfo: "", status: "unfinished", remark: "" };
  const order = { id: null, customerCode: marker, customerName: marker, receiver: "自提", orderDate: "2098-01-01", deductFutures: false, warehouse: "HONGHAI", items: [{ code, name: "测试塑料", packCount: 70, unitPrice: 8000, remark: "" }] };
  async function stock(materialCode = code) {
    const rows = await db.inboundRecord.findMany({ where: { code: materialCode } });
    const { totalPack, honghaiPack } = summarizeStock(rows.map((r) => ({ ...r, packCount: Number(r.packCount), inboundUnitPrice: r.inboundUnitPrice === null ? null : Number(r.inboundUnitPrice) })), 50);
    return [totalPack, honghaiPack];
  }
  try {
    await db.material.create({ data: { code, name: "测试塑料", packsPerTon: 50 } });
    // Old clients and historical data keep the original warehouse default.
    await db.inboundRecord.create({ data: { code, name: code, packCount: 200 } });
    await db.inboundRecord.create({ data: { code, name: code, packCount: 50, warehouse: "HONGHAI" } });
    assert.deepEqual(await stock(), [200, 50]);

    const saved = await persistCustomerOrder(order); assert.ok(saved.ok);
    assert.equal((await readCustomerOrders("", saved.id))[0].warehouse, "HONGHAI");
    const shipped = await shipCustomerOrder(saved.id); assert.ok(shipped.ok);
    assert.match(shipped.warnings[0], /宏海仓/);
    assert.deepEqual(await stock(), [200, -20], "shortage must not consume main warehouse stock");
    assert.equal((await shipCustomerOrder(saved.id)).ok, false);
    assert.equal((await unshipCustomerOrder(saved.id)).ok, true);
    assert.deepEqual(await stock(), [200, 50]);
    assert.equal((await unshipCustomerOrder(saved.id)).ok, false);

    // The operator may select the source warehouse when confirming shipment.
    assert.equal((await shipCustomerOrder(saved.id, undefined, "MAIN")).ok, true);
    assert.deepEqual(await stock(), [130, 50]);
    assert.equal((await readCustomerOrders("", saved.id))[0].warehouse, "MAIN");
    assert.equal((await unshipCustomerOrder(saved.id)).ok, true);
    assert.deepEqual(await stock(), [200, 50]);
    assert.equal((await shipCustomerOrder(saved.id, undefined, "INVALID" as "MAIN")).ok, false);

    const missing = await persistCustomerOrder({ ...order, items: [{ ...order.items[0], code: absent, packCount: 10 }] }); assert.ok(missing.ok);
    assert.equal((await shipCustomerOrder(missing.id)).ok, true);
    assert.deepEqual(await stock(absent), [0, -10], "negative receipts retain the selected warehouse");
    await unshipCustomerOrder(missing.id);
    assert.deepEqual(await stock(absent), [0, 0]);

    const whole = await persistPurchaseOrder({ ...purchase, arrivalDate: "2000-01-01" }); assert.ok(whole.ok);
    assert.deepEqual(await stock(), [200, 150]);
    let row = (await readPurchaseOrders(filter)).data.find((r) => r.id === whole.id)!;
    assert.equal(row.warehouse, "HONGHAI");
    const move = await persistPurchaseOrder({ ...row, warehouse: "MAIN" });
    assert.equal(move.ok, false, "an already received purchase cannot change warehouse");
    assert.deepEqual(await stock(), [200, 150]);
    assert.ok((await persistPurchaseOrder({ ...row, arrivalDate: "", status: "unfinished" })).ok);
    assert.deepEqual(await stock(), [200, 50], "whole receipt rollback removes only Honghai stock");

    const batched = await persistPurchaseOrder(purchase); assert.ok(batched.ok);
    const first = await addPurchaseDelivery({ orderId: batched.id, deliveryDate: "2000-01-02", quantity: 1 }); assert.ok(first.ok);
    assert.deepEqual(await stock(), [200, 100]);
    assert.equal((await persistPurchaseOrder({ ...first.record, warehouse: "MAIN" })).ok, false);
    const future = await addPurchaseDelivery({ orderId: batched.id, deliveryDate: "2098-02-01", quantity: 1 }); assert.ok(future.ok);
    assert.deepEqual(await stock(), [200, 100]);
    const pendingId = future.record.deliveries.find((d) => !d.synced)!.id;
    await db.purchaseOrderDelivery.update({ where: { id: pendingId }, data: { deliveryDate: new Date("2000-01-03") } });
    await Promise.all([readPurchaseOrders(filter), readPurchaseOrders(filter)]);
    assert.deepEqual(await stock(), [200, 150], "scheduled arrival is credited once to Honghai");
    assert.ok((await removePurchaseDelivery(batched.id, pendingId)).ok);
    assert.deepEqual(await stock(), [200, 100]);
    assert.ok((await removePurchaseDelivery(batched.id, first.record.deliveries[0].id)).ok);
    assert.deepEqual(await stock(), [200, 50]);

    // A purchase that has not arrived can still change its destination.
    row = (await readPurchaseOrders(filter)).data.find((r) => r.id === whole.id)!;
    assert.ok((await persistPurchaseOrder({ ...row, warehouse: "MAIN", arrivalDate: "2098-04-01" })).ok);
    await db.purchaseOrder.update({ where: { id: whole.id }, data: { arrivalDate: new Date("2000-01-04") } });
    await Promise.all([readPurchaseOrders(filter), readPurchaseOrders(filter)]);
    assert.deepEqual(await stock(), [300, 50]);
  } finally {
    await db.customerOrder.deleteMany({ where: { customerCode: marker } });
    await db.receiverHistory.deleteMany({ where: { customerCode: marker } });
    await db.purchaseOrder.deleteMany({ where: { supplier: marker } });
    await db.inboundRecord.deleteMany({ where: { code: { in: [code, absent] } } });
    await db.material.deleteMany({ where: { code: { in: [code, absent] } } });
    await db.$disconnect();
  }
});
