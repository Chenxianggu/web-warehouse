import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { persistFullContainer, readFullContainers, removeFullContainer } from "../src/server/full-containers";
import { emptyContainerFilter } from "../src/features/full-containers/schema";
import { readReceivables } from "../src/server/receivables";
import { fullContainerCode } from "../src/features/receivables/ledger";
test("full-container sales preserve stock, consignment metadata and receivables across mode changes", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma(); const marker = `fctest-${randomUUID().slice(0, 10)}`; const code = marker + "-P";
  const input = { id: null, updatedAt: null, orderDate: "2098-01-01", buyer: marker, itemName: code, quantity: 2.125, unitPrice: 8000, taxIncluded: true, deliveryInfo: "自提", warehouseOnArrival: false, remark: "销售备注", supplier: marker, supplyOrderDate: "2098-01-02", supplyUnitPrice: 7000, supplyTaxIncluded: true, followStatus: "待安排", delivered: false, deliveryDate: "", supplyRemark: "供货备注" };
  const filter = { ...emptyContainerFilter, buyer: marker };
  const stock = async () => Number((await db.inboundRecord.aggregate({ where: { code }, _sum: { packCount: true } }))._sum.packCount || 0);
  try {
    await db.material.create({ data: { code, name: "测试物料", packsPerTon: 50 } });
    const saved = await persistFullContainer(input); assert.ok(saved.ok); assert.equal(await stock(), 106);
    let row = (await readFullContainers(filter)).data[0]; assert.equal(row.amount, 17000); assert.equal(row.supplyAmount, 14875); assert.equal(row.quantity, 2.125);
    assert.equal((await readReceivables()).rows.find((r) => r.customerCode === fullContainerCode(marker))?.totalAmount, 17000);
    assert.ok((await persistFullContainer({ ...row, remark: "更新" })).ok); assert.equal(await stock(), 106, "ordinary edits do not receive goods twice");
    assert.equal((await persistFullContainer(row)).ok, false, "stale edits fail");
    row = (await readFullContainers(filter)).data[0]; assert.ok((await persistFullContainer({ ...row, warehouseOnArrival: true })).ok);
    assert.equal(await stock(), 0); row = (await readFullContainers(filter)).data[0]; assert.equal(row.supplier, ""); assert.equal(row.supplyAmount, 0); assert.equal(row.supplyTaxIncluded, false);
    const linked = await db.customerConsignment.findFirstOrThrow({ where: { sourceFullContainerId: row.id } });
    await db.customerConsignment.update({ where: { id: linked.id }, data: { arrivalDate: new Date("2098-01-10"), storageFeePrice: .5, storageFeeDays: 5, storageFeeTotal: 5, outboundHistory: [{ date: "2098-01-12", quantity: .125 }], outboundQuantity: .125 } });
    assert.ok((await persistFullContainer({ ...row, quantity: 3.125 })).ok);
    const preserved = await db.customerConsignment.findUniqueOrThrow({ where: { id: linked.id } }); assert.equal(Number(preserved.quantity), 3.125); assert.equal(Number(preserved.storageFeeTotal), 5); assert.equal(preserved.arrivalDate?.toISOString().slice(0, 10), "2098-01-10"); assert.equal(Number(preserved.outboundQuantity), .125);
    assert.equal(await db.customerConsignment.count({ where: { sourceFullContainerId: row.id } }), 1);
    row = (await readFullContainers(filter)).data[0]; assert.ok((await persistFullContainer({ ...row, warehouseOnArrival: false })).ok); assert.equal(await stock(), 156); assert.equal(await db.customerConsignment.count({ where: { sourceFullContainerId: row.id } }), 0);
    row = (await readFullContainers(filter)).data[0]; assert.ok((await removeFullContainer(row.id, row.updatedAt)).ok); assert.equal(await stock(), 156, "reference deletion retains received stock");
    assert.ok(!(await readReceivables()).rows.some((r) => r.customerCode === fullContainerCode(marker)));
    const consigned = await persistFullContainer({ ...input, warehouseOnArrival: true }); assert.ok(consigned.ok); assert.equal(await stock(), 156);
    row = (await readFullContainers(filter)).data[0]; assert.ok((await removeFullContainer(row.id, row.updatedAt)).ok); assert.equal(await db.customerConsignment.count({ where: { sourceFullContainerId: row.id } }), 0);
    await db.fullContainerRecord.createMany({ data: Array.from({ length: 11 }, () => ({ orderDate: new Date(input.orderDate), buyer: marker, supplier: marker, itemName: code, quantity: 1 })) });
    const page = await readFullContainers({ ...filter, startDate: "2098-01-01", endDate: "2098-01-02", supplier: marker, itemName: code, page: 99, pageSize: 10 }); assert.equal(page.total, 11); assert.equal(page.page, 2); assert.equal(page.data.length, 1);
  } finally { await db.customerConsignment.deleteMany({ where: { customerName: marker } }); await db.fullContainerRecord.deleteMany({ where: { buyer: marker } }); await db.inboundRecord.deleteMany({ where: { code } }); await db.material.deleteMany({ where: { code } }); await db.$disconnect(); }
});
