import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReceivables, fullContainerCode } from "../src/features/receivables/ledger";
import { paymentSchema } from "../src/features/receivables/schema";
import { matchesSearch, searchIndex } from "../src/features/receivables/search";

test("reference ledger merges ordinary orders and both container modes, maps standalone buyers and sorts by debt", () => {
  const rows = buildReceivables([
    { customerCode: "C1", customerName: "张三", amount: "1000.1234" },
    { customerCode: "C2", customerName: "李四", amount: "500" },
    { customerCode: "C0", customerName: "零元", amount: "0" },
  ], [{ code: "C3", fullName: " 王五 " }], [
    { buyer: "张三", amount: "100" }, { buyer: " 张三 ", amount: "200" },
    { buyer: "王五", amount: "800" }, { buyer: "新 客户", amount: "2000" }, { buyer: "", amount: "9999" },
  ], [{ customerCode: "C1", amount: "300" }, { customerCode: "C2", amount: "800" }, { customerCode: "C3", amount: "800" }, { customerCode: "PAYMENT_ONLY", amount: "1" }]);
  assert.deepEqual(rows.map((row) => row.customerCode), ["fc_新_客户", "C1", "C3", "C2"]);
  assert.deepEqual(rows[1], { customerCode: "C1", customerName: "张三", totalAmount: 1300.12, paidAmount: 300, receivableAmount: 1000.12 });
  assert.equal(rows[2].receivableAmount, 0);
  assert.equal(rows[3].receivableAmount, -300, "overpayment remains a negative balance");
  assert.equal(fullContainerCode("新  客户"), "fc_新_客户");
});

test("amounts are rounded after aggregation and subtraction", () => {
  const rows = buildReceivables([{ customerCode: "C", customerName: "客户", amount: "0.105" }], [], [], [{ customerCode: "C", amount: "0.10" }]);
  assert.equal(rows[0].totalAmount, 0.11);
  assert.equal(rows[0].receivableAmount, 0.01);
});

test("customer search supports code, Chinese, full pinyin, initials and blank keywords", () => {
  const index = searchIndex("C001", "张三");
  for (const query of ["c001", "张", "zhangsan", "ZS", "  zs ", ""]) assert.ok(matchesSearch(index, query), query);
  assert.equal(matchesSearch(index, "李四"), false);
});

test("payment validation permits manual and synthetic customers and rejects invalid money/dates", () => {
  const valid = { customerCode: "fc_新客户", customerName: "新客户", amount: 123.45, paymentDate: "2026-10-14", remark: "  银行转账  " };
  assert.equal(paymentSchema.parse(valid).remark, "银行转账");
  for (const amount of [0, -1, NaN, Infinity, 0.001, 1.234, 10000000000]) assert.equal(paymentSchema.safeParse({ ...valid, amount }).success, false);
  for (const paymentDate of ["", "2026-02-29", "2026-13-01", "14/10/2026"]) assert.equal(paymentSchema.safeParse({ ...valid, paymentDate }).success, false);
  assert.equal(paymentSchema.safeParse({ ...valid, paymentDate: "2028-02-29" }).success, true);
  assert.equal(paymentSchema.safeParse({ ...valid, customerCode: " " }).success, false);
  assert.equal(paymentSchema.safeParse({ ...valid, customerName: " " }).success, false);
});
