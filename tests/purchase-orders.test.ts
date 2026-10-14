import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { purchaseInputSchema, deliveryInputSchema, deliveryStatus, type PurchaseRecord } from "../src/features/purchase-orders/schema";
import { buildPurchaseWorkbook } from "../src/server/purchase-export";
const row: PurchaseRecord = { id: 1, updatedAt: "2026-10-14T00:00:00.000Z", orderDate: "2026-10-01", supplier: "供货方", itemCode: "PP", category: "通用", quantity: 12.345, unitPrice: 8000, amount: 98760, taxIncluded: true, remittanceInCompany: "汇入公司", remittanceOutCompany: "汇出公司", remittanceDate: "2026-10-02", deliveryInfo: "自提", arrivalDate: "2026-10-03", status: "unfinished", effectiveStatus: "finished", remark: "测试", deliverySum: 12.345, deliveries: [] };
test("purchase validation accepts manual codes and rejects invalid dates, precision and totals", () => {
  assert.ok(purchaseInputSchema.safeParse(row).success);
  assert.ok(purchaseInputSchema.safeParse({ ...row, itemCode: "P".repeat(100) }).success);
  for (const input of [{ orderDate: "2026-02-30" }, { supplier: " " }, { quantity: .0001 }, { quantity: -1 }, { unitPrice: .001 }, { quantity: 999999999, unitPrice: 9999999999 }, { updatedAt: null }]) assert.equal(purchaseInputSchema.safeParse({ ...row, ...input }).success, false);
  assert.equal(deliveryInputSchema.safeParse({ orderId: 1, deliveryDate: "2026-10-01", quantity: 0 }).success, false);
});
test("delivery status uses due quantities and falls back to manual status when no batch has arrived", () => {
  assert.equal(deliveryStatus(20, 10, "finished"), "unfinished");
  assert.equal(deliveryStatus(20, 20, "unfinished"), "finished");
  assert.equal(deliveryStatus(20, 0, "finished"), "finished");
});
test("export keeps numerical values, tax, remittances and computed delivery status", async () => {
  const buffer = await buildPurchaseWorkbook([row]); const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("订货记录")!;
  assert.equal(sheet.rowCount, 2); assert.equal(sheet.getCell("E2").value, 12.345);
  assert.equal(sheet.getCell("G2").value, 98760); assert.equal(sheet.getCell("H2").value, "含税");
  assert.equal(sheet.getCell("I2").value, "汇入公司"); assert.equal(sheet.getCell("N2").value, "已交货");
});
