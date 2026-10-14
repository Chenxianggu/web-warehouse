import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { persistPurchaseOrder, readPurchaseOrders, addPurchaseDelivery, removePurchaseDelivery, removePurchaseOrder } from "../src/server/purchase-orders";
import { emptyPurchaseFilter } from "../src/features/purchase-orders/schema";
test("purchase receipts, scheduled batches, reversal, filtering and concurrent arrivals remain consistent", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma(); const marker = `potest-${randomUUID().slice(0, 12)}`; const code = marker + "-A";
  const input = { id: null, updatedAt: null, orderDate: "2098-01-01", supplier: marker, itemCode: code, category: marker, quantity: 20, unitPrice: 8000, taxIncluded: true, remittanceInCompany: "入", remittanceOutCompany: "出", remittanceDate: "2000-01-01", arrivalDate: "", deliveryInfo: "自提", status: "unfinished", remark: "测试" };
  const filter = { ...emptyPurchaseFilter, supplier: marker };
  const stock = async () => Number((await db.inboundRecord.aggregate({ where: { code }, _sum: { packCount: true } }))._sum.packCount || 0);
  try {
    await db.material.create({ data: { code, name: "塑料测试", packsPerTon: 50 } });
    const saved = await persistPurchaseOrder(input); assert.ok(saved.ok); assert.equal(await stock(), 0);
    const past = await addPurchaseDelivery({ orderId: saved.id, deliveryDate: "2000-01-05", quantity: 5 }); assert.ok(past.ok); assert.equal(await stock(), 250);
    assert.equal(past.record.effectiveStatus, "unfinished");
    const future = await addPurchaseDelivery({ orderId: saved.id, deliveryDate: "2098-02-01", quantity: 15 }); assert.ok(future.ok); assert.equal(await stock(), 250);
    assert.equal((await addPurchaseDelivery({ orderId: saved.id, deliveryDate: "2098-02-02", quantity: .001 })).ok, false);
    assert.equal((await readPurchaseOrders({ ...filter, status: "unfinished" })).total, 1);
    assert.equal((await persistPurchaseOrder({ ...future.record, quantity: 19 })).ok, false);
    const futureId = future.record.deliveries.find((d) => !d.synced)!.id;
    await db.purchaseOrderDelivery.update({ where: { id: futureId }, data: { deliveryDate: new Date("2000-01-10") } });
    await Promise.all([readPurchaseOrders(filter), readPurchaseOrders(filter)]);
    assert.equal(await stock(), 1000, "repeated and concurrent arrival sync must not duplicate stock");
    const page = await readPurchaseOrders({ ...filter, status: "finished", date: input.orderDate, category: marker, arrivalDate: "2000-01-10", itemCode: code });
    assert.equal(page.total, 1); assert.equal(page.data[0].deliverySum, 20); assert.equal(page.data[0].arrivalDate, "2000-01-10");
    const receipt = await db.inboundRecord.findFirstOrThrow({ where: { sourceType: "purchase_delivery", sourceId: futureId } });
    assert.equal(Number(receipt.inboundUnitPrice), 8000); assert.equal(receipt.taxIncluded, true);
    const removed = await removePurchaseDelivery(saved.id, futureId); assert.ok(removed.ok); assert.equal(await stock(), 250); assert.equal(removed.record.effectiveStatus, "unfinished");
    assert.equal((await removePurchaseDelivery(saved.id, futureId)).ok, false);
    assert.ok((await removePurchaseOrder(saved.id, removed.record.updatedAt)).ok); assert.equal(await stock(), 250, "reference order deletion retains previously received stock");

    const whole = await persistPurchaseOrder({ ...input, arrivalDate: "2000-01-01", quantity: 2 }); assert.ok(whole.ok); assert.equal(await stock(), 350);
    const wholeRow = (await readPurchaseOrders(filter)).data[0];
    const reverted = await persistPurchaseOrder({ ...wholeRow, arrivalDate: "", status: "unfinished", taxIncluded: false }); assert.ok(reverted.ok); assert.equal(await stock(), 250);
    const untaxed = (await readPurchaseOrders(filter)).data[0]; assert.equal(untaxed.remittanceInCompany, ""); assert.equal(untaxed.remittanceDate, "");
    assert.equal((await persistPurchaseOrder(wholeRow)).ok, false, "stale edits cannot overwrite a newer save");
    await db.purchaseOrder.update({ where: { id: whole.id }, data: { arrivalDate: new Date("2000-01-02") } });
    await Promise.all([readPurchaseOrders(filter), readPurchaseOrders(filter)]); assert.equal(await stock(), 350);
    const converted = await addPurchaseDelivery({ orderId: whole.id, deliveryDate: "2000-01-03", quantity: 1 }); assert.ok(converted.ok);
    assert.equal(await stock(), 300, "converting whole-order receipts to batches must not double-count stock");
    const pending = await addPurchaseDelivery({ orderId: whole.id, deliveryDate: "2098-01-04", quantity: 1 }); assert.ok(pending.ok);
    const pendingId = pending.record.deliveries.find((d) => !d.synced)!.id;
    assert.ok((await removePurchaseDelivery(whole.id, pendingId)).ok); assert.equal(await stock(), 300, "deleting a pending batch does not affect stock");
    await db.purchaseOrder.createMany({ data: Array.from({ length: 10 }, () => ({ orderDate: new Date(input.orderDate), itemCode: code, supplier: marker, quantity: 1, category: marker })) });
    assert.equal((await readPurchaseOrders({ ...filter, page: 99, pageSize: 10 })).page, 2);
    assert.equal((await readPurchaseOrders(filter, true)).data.length, 11);
  } finally {
    await db.purchaseOrder.deleteMany({ where: { supplier: marker } });
    await db.inboundRecord.deleteMany({ where: { code } }); await db.material.deleteMany({ where: { code } }); await db.$disconnect();
  }
});
