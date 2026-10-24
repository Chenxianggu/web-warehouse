import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { allocateConsignment, outboundFilterSchema } from "../src/features/outbound/schema";
import { buildDeliveryNote, lineWeightKg, numberToChinese } from "../src/features/outbound/delivery-note";
import { buildOutboundWorkbook } from "../src/server/outbound-export";
import type { OrderRecord } from "../src/features/customer-orders/schema";

const order: OrderRecord = {
  id: 1, orderNo: "20261014001", customerCode: "C1", customerName: "测试客户", receiver: "自提", orderDate: "2026-10-14",
  isShipped: true, deductFutures: true, warehouse: "MAIN", createdAt: "2026-10-14T00:00:00Z",
  items: Array.from({ length: 6 }, (_, index) => ({ code: `PP${index}`, name: `塑料${index}`, packCount: 20, unitPrice: 8000, packsPerTon: 50, remark: index ? "" : "备注<script>alert(1)</script>" })),
};

test("consignment deduction chooses the smallest sufficient row before FIFO", () => {
  const rows = [{ id: 1, quantity: 10, outboundQuantity: 1 }, { id: 2, quantity: 2, outboundQuantity: 1 }, { id: 3, quantity: 4, outboundQuantity: 1 }];
  assert.deepEqual(allocateConsignment(rows, 2), [{ id: 3, quantity: 2 }]);
  assert.deepEqual(allocateConsignment(rows, 12), [{ id: 1, quantity: 9 }, { id: 2, quantity: 1 }, { id: 3, quantity: 2 }]);
  assert.deepEqual(allocateConsignment(rows, 15), [{ id: 1, quantity: 9 }, { id: 2, quantity: 1 }, { id: 3, quantity: 5 }]);
  assert.deepEqual(allocateConsignment([], 1), []);
});

test("print template paginates every five items, escapes data, and hides all monetary values", () => {
  const html = buildDeliveryNote(order, false);
  assert.equal((html.match(/<div class="print-page/g) || []).length, 2);
  assert.equal((html.match(/<tfoot>/g) || []).length, 1);
  assert.equal((html.match(/提以往库存/g) || []).length, 1);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("19200.00"));
  assert.ok(html.includes("241mm 140mm"));
  const hidden = buildDeliveryNote(order, true);
  assert.ok(!hidden.includes("19200.00"));
  assert.ok(!hidden.includes("3200.00"));
  assert.ok(!hidden.includes("人民币:"));
  assert.equal(lineWeightKg(order.items[0]), 400);
  assert.equal(lineWeightKg({ packCount: 20, packsPerTon: 0 }), 500);
});

test("Chinese money handles zero, cents, trailing zeros and large groups", () => {
  assert.equal(numberToChinese(0), "零圆整");
  assert.equal(numberToChinese(3200), "叁仟贰佰圆整");
  assert.equal(numberToChinese(10001.05), "壹万零壹圆零伍分");
  assert.equal(numberToChinese(100000001.1), "壹亿零壹圆壹角");
});

test("outbound filters reject impossible dates and unsupported pagination", () => {
  assert.ok(outboundFilterSchema.safeParse({ isShipped: false, date: "", customer: "测试" }).success);
  assert.ok(!outboundFilterSchema.safeParse({ isShipped: false, date: "2026-02-30", customer: "" }).success);
  assert.ok(!outboundFilterSchema.safeParse({ isShipped: false, date: "", customer: "", pageSize: 10000 }).success);
});

test("Excel export contains every line and preserves numeric prices and subtotals", async () => {
  const buffer = await buildOutboundWorkbook([order]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("已出库订单")!;
  assert.equal(sheet.rowCount, 7);
  assert.deepEqual(Array.from({ length: 5 }, (_, index) => sheet.getCell(1, index + 1).value), ["客户姓名", "塑料编号", "包数", "单价", "小计"]);
  assert.equal(sheet.getCell("A2").value, "测试客户");
  assert.equal(sheet.getCell("C2").value, 20);
  assert.equal(sheet.getCell("D2").value, 8000);
  assert.equal(sheet.getCell("E2").value, 3200);
  assert.equal(sheet.getCell("F2").value, "本仓库");
  const honghai = new ExcelJS.Workbook();
  await honghai.xlsx.load(await buildOutboundWorkbook([{ ...order, warehouse: "HONGHAI" }]));
  assert.equal(honghai.getWorksheet("已出库订单")!.getCell("F2").value, "宏海仓");
});
