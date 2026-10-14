import ExcelJS from "exceljs";
import { lineSubtotal, type OrderRecord } from "@/features/customer-orders/schema";

export async function buildOutboundWorkbook(orders: OrderRecord[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("已出库订单");
  sheet.columns = [
    { header: "客户姓名", key: "customer", width: 15 },
    { header: "塑料编号", key: "code", width: 15 },
    { header: "包数", key: "packs", width: 10 },
    { header: "单价", key: "price", width: 15 },
    { header: "小计", key: "subtotal", width: 15 },
  ];
  for (const order of orders) for (const item of order.items) {
    sheet.addRow({ customer: order.customerName, code: item.code, packs: Math.round(item.packCount), price: item.unitPrice, subtotal: lineSubtotal(item) });
  }
  return workbook.xlsx.writeBuffer();
}
