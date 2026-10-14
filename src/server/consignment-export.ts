import ExcelJS from "exceljs";
import { outboundTotal, type ConsignmentRecord } from "@/features/consignments/schema";

export async function buildConsignmentWorkbook(rows: ConsignmentRecord[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("客户寄存");
  sheet.columns = [
    { header: "订货日期", key: "orderDate", width: 15 }, { header: "客户名", key: "customerName", width: 22 },
    { header: "货号", key: "itemCode", width: 20 }, { header: "数量(吨)", key: "quantity", width: 15 },
    { header: "已出库(吨)", key: "outbound", width: 15 }, { header: "单价", key: "unitPrice", width: 15 },
    { header: "总金额", key: "amount", width: 18 }, { header: "到货日期", key: "arrivalDate", width: 15 },
    { header: "是否已收货", key: "received", width: 15 }, { header: "仓租单价(元/吨/天)", key: "storageFeePrice", width: 24 },
    { header: "仓租总价", key: "storageFeeTotal", width: 18 }, { header: "备注", key: "remark", width: 35 },
  ];
  for (const row of rows) sheet.addRow({ ...row, outbound: outboundTotal(row), received: row.status === "finished" ? "已收货" : "未收货" });
  sheet.getRow(1).font = { bold: true };
  for (const key of ["unitPrice", "amount", "storageFeePrice", "storageFeeTotal"]) sheet.getColumn(key).numFmt = "#,##0.00";
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return book.xlsx.writeBuffer();
}
