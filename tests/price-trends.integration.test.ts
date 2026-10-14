import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { getPrisma } from "../src/server/db";
import { readPurchaseItemCodes, readPurchasePriceHistory } from "../src/server/price-trends";

test("purchase prices include both tax/status modes, isolate code/year and reflect edits/deletes", { skip: process.env.RUN_DATABASE_TESTS !== "1" }, async () => {
  const db = getPrisma(), prefix = `pt-${randomUUID()}`;
  const code = `${prefix}-A`, other = `${prefix}-B`;
  try {
    const base = { itemCode: code, quantity: 1, supplier: prefix };
    await db.purchaseOrder.createMany({ data: [
      { ...base, orderDate: new Date("2096-12-31"), unitPrice: 100 },
      { ...base, orderDate: new Date("2097-01-01"), unitPrice: 7000, taxIncluded: true, status: "finished" },
      { ...base, orderDate: new Date("2097-01-01"), unitPrice: 7000, taxIncluded: false },
      { ...base, orderDate: new Date("2097-01-01"), unitPrice: 7050 },
      { ...base, orderDate: new Date("2097-12-31"), unitPrice: 0 },
      { ...base, orderDate: new Date("2098-01-01"), unitPrice: 200 },
      { ...base, itemCode: other, orderDate: new Date("2097-01-01"), unitPrice: 9999 },
      { ...base, itemCode: "   ", orderDate: new Date("2097-01-01"), unitPrice: 9999 },
    ] });
    const codes = await readPurchaseItemCodes();
    assert.deepEqual(codes.filter((item) => item.startsWith(prefix)), [code, other]);
    assert.ok(codes.every((item) => item.trim()));
    const expected = [
      { orderDate: "2097-01-01", unitPrice: 7000 },
      { orderDate: "2097-01-01", unitPrice: 7050 },
      { orderDate: "2097-12-31", unitPrice: 0 },
    ];
    assert.deepEqual(await readPurchasePriceHistory({ itemCode: code, year: 2097 }), expected);
    assert.deepEqual(await readPurchasePriceHistory({ itemCode: ` ${code.toUpperCase()} `, year: 2097 }), expected);
    assert.deepEqual(await readPurchasePriceHistory({ itemCode: code, year: 2095 }), []);
    const target = await db.purchaseOrder.findFirstOrThrow({ where: { itemCode: code, unitPrice: 7050 } });
    await db.purchaseOrder.update({ where: { id: target.id }, data: { unitPrice: 7200 } });
    assert.equal((await readPurchasePriceHistory({ itemCode: code, year: 2097 }))[1].unitPrice, 7200);
    await db.purchaseOrder.delete({ where: { id: target.id } });
    assert.equal((await readPurchasePriceHistory({ itemCode: code, year: 2097 })).length, 2);
    await assert.rejects(() => readPurchasePriceHistory({ itemCode: " ", year: 2097 }));
  } finally {
    await db.purchaseOrder.deleteMany({ where: { supplier: prefix } });
    await db.$disconnect();
  }
});
