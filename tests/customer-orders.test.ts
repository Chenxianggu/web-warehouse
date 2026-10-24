import assert from "node:assert/strict";
import { test } from "node:test";
import { customerOrderSchema, lineSubtotal, orderDateSchema } from "../src/features/customer-orders/schema";

const valid = {
  id: null, customerCode: "客户一", customerName: "测试客户", receiver: "自提",
  orderDate: "2026-10-14", deductFutures: true,
  items: [{ code: "PP", name: "聚丙烯", packCount: 20, unitPrice: 8000, remark: "" }],
};

test("accepts manual customer/material codes, optional zero price and trimmed remarks", () => {
  const result = customerOrderSchema.parse({ ...valid, items: [{ ...valid.items[0], unitPrice: 0, remark: "  自提备注  " }] });
  assert.equal(result.items[0].unitPrice, 0);
  assert.equal(result.items[0].remark, "自提备注");
  assert.equal(result.deductFutures, true);
  assert.equal(result.warehouse, "MAIN", "legacy requests default to the original warehouse");
  assert.equal(customerOrderSchema.parse({ ...valid, warehouse: "HONGHAI" }).warehouse, "HONGHAI");
  assert.equal(customerOrderSchema.safeParse({ ...valid, warehouse: "unknown" }).success, false);
});

test("rejects invalid dates, while allowing leap day", () => {
  for (const date of ["", "2026-02-29", "2026-02-30", "2026-13-01", "2026-1-01", "not-a-date"]) assert.equal(orderDateSchema.safeParse(date).success, false, date);
  assert.equal(orderDateSchema.safeParse("2028-02-29").success, true);
});

test("requires the same customer fields and at least one complete order line", () => {
  for (const field of ["customerCode", "customerName", "receiver"]) assert.equal(customerOrderSchema.safeParse({ ...valid, [field]: " " }).success, false, field);
  assert.equal(customerOrderSchema.safeParse({ ...valid, items: [] }).success, false);
  for (const patch of [{ code: "" }, { name: "" }, { packCount: 0 }, { packCount: 1.5 }, { packCount: -1 }, { unitPrice: -1 }, { unitPrice: 1.001 }, { unitPrice: Infinity }, { remark: "a".repeat(501) }]) {
    assert.equal(customerOrderSchema.safeParse({ ...valid, items: [{ ...valid.items[0], ...patch }] }).success, false, JSON.stringify(patch));
  }
});

test("calculates a per-ton price using the material's packs per ton, falling back to 40", () => {
  assert.equal(lineSubtotal({ packCount: 20, unitPrice: 8000, packsPerTon: 40 }), 4000);
  assert.equal(lineSubtotal({ packCount: 20, unitPrice: 8000, packsPerTon: 50 }), 3200);
  assert.equal(lineSubtotal({ packCount: 20, unitPrice: 8000, packsPerTon: 0 }), 4000);
  assert.equal(lineSubtotal({ packCount: 20, unitPrice: 0, packsPerTon: 40 }), 0);
});
