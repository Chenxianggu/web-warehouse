import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { consignmentInputSchema, storageFee, outboundTotal, type ConsignmentRecord } from "../src/features/consignments/schema";
import { buildWarehouseNote } from "../src/features/consignments/warehouse-note";
import { buildConsignmentWorkbook } from "../src/server/consignment-export";

const row: ConsignmentRecord = { id: 12, updatedAt: "2026-10-14T00:00:00.000Z", orderDate: "2026-10-01", customerName: "客户<script>", itemCode: "PP-01", quantity: 20, unitPrice: 8000, amount: 160000, arrivalDate: "2026-10-01", storageFeePrice: .5, storageFeeDays: 7, storageFeeTotal: 125, outboundQuantity: 0, outboundHistory: [{ date: "2026-10-16", quantity: 15 }, { date: "2026-10-06", quantity: 5 }], status: "finished", remark: "测试 & 自提", sourceFullContainerId: null, packsPerTon: 50 };
test("storage rent sorts withdrawals and bills each interval's remaining tons", () => {
  assert.equal(storageFee(row), 125); // 20 × .5 × 5 + 15 × .5 × 10
  assert.equal(storageFee({ ...row, outboundHistory: [] }), 70);
  assert.equal(storageFee({ ...row, outboundHistory: [{ date: row.arrivalDate, quantity: 0 }] }), 70, "an empty draft withdrawal does not change the quote");
  assert.equal(storageFee({ ...row, arrivalDate: "" }), 0);
  assert.equal(storageFee({ ...row, outboundHistory: [{ date: row.arrivalDate, quantity: 20 }] }), 0);
  assert.equal(outboundTotal(row), 20);
  assert.equal(outboundTotal({ outboundHistory: [], outboundQuantity: 2.5 }), 2.5);
});
test("invalid dates, negative quantities and withdrawals before arrival are rejected", () => {
  assert.equal(consignmentInputSchema.safeParse(row).success, true);
  for (const change of [{ orderDate: "2026-02-30" }, { quantity: -1 }, { updatedAt: null }, { outboundHistory: [{ date: "2026-09-30", quantity: 1 }] }, { quantity: 9999999999, unitPrice: 9999999999 }]) assert.equal(consignmentInputSchema.safeParse({ ...row, ...change }).success, false);
});
test("warehouse note converts tons using material packs and hides all monetary values", () => {
  const html = buildWarehouseNote(row, false);
  assert.ok(html.includes("任仲塑料寄存仓单"));
  assert.ok(html.includes("客户&lt;script&gt;"));
  assert.ok(html.includes("<td>1000</td><td>20000</td><td>8.00</td><td>160000.00</td>"));
  const hidden = buildWarehouseNote(row, true);
  assert.ok(!hidden.includes("160000.00"));
  assert.ok(!hidden.includes("人民币:"));
  assert.ok(hidden.includes("<td>20000</td><td></td><td></td>"));
});
test("Excel export contains numeric values, dates, status and withdrawals", async () => {
  const buffer = await buildConsignmentWorkbook([row]);
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  const sheet = book.getWorksheet("客户寄存")!;
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getCell("D2").value, 20);
  assert.equal(sheet.getCell("E2").value, 20);
  assert.equal(sheet.getCell("I2").value, "已收货");
  assert.equal(sheet.getCell("L2").value, "测试 & 自提");
});
