import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeStock } from "../src/features/inventory/stock";

test("warehouse balances and main warehouse cost remain independent, including negative stock", () => {
  const stock = summarizeStock([
    { warehouse: "MAIN", packCount: 40, inboundUnitPrice: 1130, taxIncluded: true },
    { warehouse: "MAIN", packCount: 40, inboundUnitPrice: 2000, taxIncluded: false },
    { warehouse: "MAIN", packCount: -10, inboundUnitPrice: null, taxIncluded: false },
    { warehouse: "HONGHAI", packCount: 200, inboundUnitPrice: 9000, taxIncluded: false },
    { warehouse: "HONGHAI", packCount: -210, inboundUnitPrice: null, taxIncluded: false },
  ], 40);
  assert.equal(stock.totalPack, 70);
  assert.equal(stock.honghaiPack, -10);
  assert.ok(Math.abs(stock.exTaxAvgPrice! - 1500) < .000001);
  assert.deepEqual(summarizeStock([], 50), { totalPack: 0, honghaiPack: 0, exTaxAvgPrice: null });
});
