import ExcelJS from "exceljs";
import { warehouseLabel } from "@/features/inventory/warehouse";
import type { PurchaseRecord } from "@/features/purchase-orders/schema";
export async function buildPurchaseWorkbook(rows: PurchaseRecord[]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("订货记录");
  sheet.columns = [
    ["订货日期", "orderDate", 15], ["供货方", "supplier", 22], ["货号", "itemCode", 20], ["类别", "category", 15],
    ["数量(吨)", "quantity", 15], ["单价", "unitPrice", 15], ["金额", "amount", 18], ["是否含税", "tax", 12],
    ["汇入公司", "remittanceInCompany", 22], ["汇出公司", "remittanceOutCompany", 22], ["汇款日期", "remittanceDate", 15],
    ["配送日期方式", "deliveryInfo", 22], ["到货日期", "arrivalDate", 15], ["是否已交货", "delivered", 15], ["备注", "remark", 30],
    ["入库仓库", "warehouse", 15],
  ].map(([header, key, width]) => ({ header: String(header), key: String(key), width: Number(width) }));
  for (const row of rows) sheet.addRow({ ...row, warehouse: warehouseLabel(row.warehouse), tax: row.taxIncluded ? "含税" : "不含税", delivered: row.effectiveStatus === "finished" ? "已交货" : "未交货" });
  sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const key of ["unitPrice", "amount"]) sheet.getColumn(key).numFmt = "#,##0.00";
  return book.xlsx.writeBuffer();
}
