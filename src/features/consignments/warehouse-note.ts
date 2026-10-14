import type { ConsignmentRecord } from "./schema";
import { escapeHtml as e, numberToChinese } from "@/features/outbound/delivery-note";
import { DELIVERY_NOTE_CSS } from "@/features/outbound/delivery-note-styles";

export function buildWarehouseNote(row: ConsignmentRecord, hidePrices: boolean) {
  const html = `<div class="print-page print-page-last"><div class="print-wrapper"><div class="print-main">
    <div class="print-header"><h1 class="print-title">任仲塑料寄存仓单</h1><div class="print-company-info">
      <div class="company-left"><p>地址:澄海区莲下镇槐泽大围头工业区</p><p class="company-line-phone">电话:13502748817/13902709817/15018376376</p><p>客户名称:${e(row.customerName)}</p></div>
      <div class="company-right"><p>寄存单号:${row.id}</p><p>送货日期: ${e(row.orderDate)}</p><p>送货地址:${e(row.remark.trim() || "寄仓")}</p></div>
    </div></div>
    <table class="print-table"><colgroup>${[8, 18, 13, 13, 11, 15, 22].map((width) => `<col style="width:${width}%">`).join("")}</colgroup>
      <thead><tr>${["序号", "商品名称", "数量(包)", "重量(kg)", "单价/kg", "金额", "备注"].map((text) => `<th>${text}</th>`).join("")}</tr></thead>
      <tbody><tr><td>1</td><td>${e(row.itemCode)}</td><td>${Math.round(row.quantity * row.packsPerTon)}</td><td>${(row.quantity * 1000).toFixed(0)}</td><td>${hidePrices ? "" : (row.unitPrice / 1000).toFixed(2)}</td><td>${hidePrices ? "" : row.amount.toFixed(2)}</td><td>${e(row.remark)}</td></tr>${Array.from({ length: 4 }, () => `<tr>${"<td>&nbsp;</td>".repeat(7)}</tr>`).join("")}</tbody>
      <tfoot><tr><td class="print-tfoot-strong">合计</td><td colspan="4" class="print-tfoot-strong print-tfoot-rmb-zh">${hidePrices ? "" : "人民币:" + numberToChinese(row.amount)}</td><td class="print-tfoot-strong">${hidePrices ? "" : row.amount.toFixed(2)}</td><td>&nbsp;</td></tr></tfoot>
    </table>
    <div class="print-signature"><div class="signature-left"><p>送货单位及经手人(盖章)：王炳先</p></div><div class="signature-right"><p>收货单位及经手人(盖章)：</p></div></div>
    <div class="print-notice-line">客户须知:本单据经收货单位或经手人签名即作为收款凭证!　白:存根　红:回单　黄:客户</div>
  </div></div></div>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>寄存仓单 - ${row.id}</title><style>${DELIVERY_NOTE_CSS}
  .print-table td { overflow-wrap:anywhere; } @media screen { .print-page { min-height:140mm; padding-top:4mm; } }
  </style></head><body>${html}</body></html>`;
}
