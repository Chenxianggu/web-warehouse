import assert from "node:assert/strict";
import { test } from "node:test";
import { containerInputSchema, containerFilterSchema, clearSupply } from "../src/features/full-containers/schema";
const input = { id: null, updatedAt: null, orderDate: "2026-10-14", buyer: "", itemName: "", quantity: 0, unitPrice: 0, taxIncluded: false, deliveryInfo: "", warehouseOnArrival: true, remark: "", supplier: "旧供方", supplyOrderDate: "2026-10-14", supplyUnitPrice: 100, supplyTaxIncluded: true, followStatus: "旧状态", delivered: true, deliveryDate: "2026-10-15", supplyRemark: "旧备注" };
test("container forms require a date and preserve three-decimal quantities", () => {
  assert.ok(containerInputSchema.safeParse(input).success);
  assert.ok(containerInputSchema.safeParse({ ...input, quantity: 1.125 }).success);
  for (const change of [{ orderDate: "2026-02-30" }, { quantity: -.01 }, { quantity: .0001 }, { unitPrice: .001 }, { id: 1 }]) assert.equal(containerInputSchema.safeParse({ ...input, ...change }).success, false);
  assert.equal(containerFilterSchema.safeParse({ startDate: "2026-10-15", endDate: "2026-10-14" }).success, false);
});
test("consignment mode clears every supply field while preserving sales", () => {
  const cleared = clearSupply(input); assert.equal(cleared.orderDate, input.orderDate); assert.equal(cleared.supplier, ""); assert.equal(cleared.supplyOrderDate, ""); assert.equal(cleared.supplyUnitPrice, 0); assert.equal(cleared.supplyTaxIncluded, false); assert.equal(cleared.followStatus, ""); assert.equal(cleared.delivered, false); assert.equal(cleared.deliveryDate, ""); assert.equal(cleared.supplyRemark, "");
});
