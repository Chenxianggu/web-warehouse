import assert from "node:assert/strict";
import { test } from "node:test";
import { preparePricePoints, priceAxisBounds, priceTrendQuerySchema, priceTrendYears, shouldSamplePrices } from "../src/features/price-trends/schema";

test("merge same-day same-price points, preserve different prices and order them by date then price", () => {
  const source = [
    { orderDate: "2026-10-14", unitPrice: 8100 }, { orderDate: "2026-10-12", unitPrice: 8100 },
    { orderDate: "2026-10-14", unitPrice: 8000 }, { orderDate: "2026-10-14", unitPrice: 8100 },
    { orderDate: "2026-10-15", unitPrice: 0 },
  ];
  assert.deepEqual(preparePricePoints(source), [source[1], source[2], source[0], source[4]]);
  assert.equal(source.length, 5, "input is not changed");
});

test("price bounds match reference padding and 50-yuan rounding for flat, near and wide ranges", () => {
  const points = (...prices: number[]) => prices.map((unitPrice) => ({ orderDate: "2026-10-14", unitPrice }));
  assert.deepEqual(priceAxisBounds([]), { min: 0, max: 8000 });
  assert.deepEqual(priceAxisBounds(points(8000)), { min: 7800, max: 8200 });
  assert.deepEqual(priceAxisBounds(points(8000, 8000)), { min: 7800, max: 8200 });
  assert.deepEqual(priceAxisBounds(points(8001, 8051)), { min: 7800, max: 8300 });
  assert.deepEqual(priceAxisBounds(points(1000, 10000)), { min: -800, max: 11800 });
  assert.deepEqual(priceAxisBounds(points(0)), { min: -200, max: 200 });
  assert.equal(shouldSamplePrices(800), false);
  assert.equal(shouldSamplePrices(801), true);
});

test("six available years follow Shanghai date even near UTC new year", () => {
  assert.deepEqual(priceTrendYears(new Date("2026-12-31T16:00:00Z")), [2027, 2026, 2025, 2024, 2023, 2022]);
  assert.deepEqual(priceTrendYears(new Date("2026-12-31T15:59:59Z")), [2026, 2025, 2024, 2023, 2022, 2021]);
});

test("query validation rejects invalid input and trims the code", () => {
  assert.equal(priceTrendQuerySchema.parse({ itemCode: " PP-001 ", year: 2026 }).itemCode, "PP-001");
  for (const itemCode of ["", "  ", "x".repeat(101)]) assert.equal(priceTrendQuerySchema.safeParse({ itemCode, year: 2026 }).success, false);
  for (const year of [NaN, 2026.5, 0, 9999, "2026"]) assert.equal(priceTrendQuerySchema.safeParse({ itemCode: "PP", year }).success, false);
});
