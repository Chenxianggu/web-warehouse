import { lineSubtotal, type OrderItem, type OrderRecord } from "@/features/customer-orders/schema";
import { DELIVERY_NOTE_CSS } from "./delivery-note-styles";

export const ITEMS_PER_PAGE = 5;

export function lineWeightKg(item: Pick<OrderItem, "packCount" | "packsPerTon">) {
  return item.packCount * 1000 / (item.packsPerTon > 0 ? item.packsPerTon : 40);
}

export function numberToChinese(amount: number) {
  const digits = "零壹贰叁肆伍陆柒捌玖";
  const units = ["", "拾", "佰", "仟"];
  const groups = ["", "万", "亿", "万亿"];
  const [integer, fraction] = Math.max(0, amount).toFixed(2).split(".");
  const chunks = integer.match(/\d{1,4}(?=(\d{4})*$)/g) || ["0"];
  let result = "";
  let needsZero = false;
  chunks.forEach((chunk, index) => {
    const value = Number(chunk);
    if (!value) { if (result) needsZero = true; return; }
    if (result && (needsZero || value < 1000)) result += "零";
    let part = "";
    let zero = false;
    [...String(value)].forEach((digit, position, array) => {
      if (digit === "0") { zero = !!part; return; }
      if (zero) part += "零";
      zero = false;
      part += digits[Number(digit)] + units[array.length - position - 1];
    });
    result += part + (groups[chunks.length - index - 1] || "");
    needsZero = false;
  });
  result = (result || "零") + "圆";
  const [jiao, fen] = fraction.split("").map(Number);
  if (!jiao && !fen) return result + "整";
  if (jiao) result += digits[jiao] + "角";
  else if (fen) result += "零";
  if (fen) result += digits[fen] + "分";
  return result;
}

export function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function buildDeliveryNote(order: OrderRecord, hidePrices: boolean) {
  const e = escapeHtml;
  const total = order.items.reduce((sum, item) => sum + lineSubtotal(item), 0);
  const pages: string[] = [];
  for (let start = 0; start < order.items.length; start += ITEMS_PER_PAGE) {
    const items = order.items.slice(start, start + ITEMS_PER_PAGE);
    const last = start + ITEMS_PER_PAGE >= order.items.length;
    const rows = items.map((item, index) => {
      const remark = order.deductFutures && start + index === 0 ? `${item.remark ? item.remark + " " : ""}提以往库存` : item.remark;
      return `<tr><td>${start + index + 1}</td><td>${e(item.name)}</td><td>${Math.round(item.packCount)}</td><td>${lineWeightKg(item).toFixed(0)}</td><td>${hidePrices ? "" : (item.unitPrice / 1000).toFixed(2)}</td><td>${hidePrices ? "" : lineSubtotal(item).toFixed(2)}</td><td>${e(remark)}</td></tr>`;
    }).join("") + Array.from({ length: ITEMS_PER_PAGE - items.length }, () => "<tr>" + "<td>&nbsp;</td>".repeat(7) + "</tr>").join("");
    pages.push(`<div class="print-page${last ? " print-page-last" : ""}"><div class="print-wrapper"><div class="print-main">
      <div class="print-header"><h1 class="print-title">任仲塑料出货单</h1><div class="print-company-info">
        <div class="company-left"><p>地址:澄海区莲下镇槐泽大围头工业区</p><p class="company-line-phone">电话:13502748817/13902709817/15018376376</p><p>客户名称:${e(order.customerName)}</p></div>
        <div class="company-right"><p>送货单号:${e(order.orderNo)}</p><p>送货日期: ${e(order.orderDate)}</p><p>送货地址:${e(order.receiver)}</p></div>
      </div></div>
      <table class="print-table"><colgroup>${[8, 18, 13, 13, 11, 15, 22].map((width) => `<col style="width:${width}%">`).join("")}</colgroup>
        <thead><tr>${["序号", "商品名称", "数量(包)", "重量(kg)", "单价/kg", "金额", "备注"].map((label) => `<th>${label}</th>`).join("")}</tr></thead>
        <tbody>${rows}</tbody>${last ? `<tfoot><tr><td class="print-tfoot-strong">合计</td><td colspan="4" class="print-tfoot-strong print-tfoot-rmb-zh">${hidePrices ? "" : "人民币:" + numberToChinese(total)}</td><td class="print-tfoot-strong">${hidePrices ? "" : total.toFixed(2)}</td><td>&nbsp;</td></tr></tfoot>` : ""}
      </table>
      ${last ? '<div class="print-signature"><div class="signature-left"><p>送货单位及经手人(盖章)：王炳先</p></div><div class="signature-right"><p>收货单位及经手人(盖章)：</p></div></div><div class="print-notice-line">客户须知:本单据经收货单位或经手人签名即作为收款凭证!　白:存根　红:回单　黄:客户</div>' : '<div class="print-continued">（续）</div>'}
    </div></div></div>`);
  }
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>订单发货单 - ${e(order.orderNo)}</title><style>${DELIVERY_NOTE_CSS}
    .print-table td { overflow-wrap:anywhere; }
  </style></head><body>${pages.join("")}</body></html>`;
}

export function openDeliveryPrint(documentHtml: string) {
  const target = window.open("", "_blank");
  if (!target) return null;
  target.document.write(documentHtml);
  target.document.close();
  return target;
}

export async function triggerDeliveryPrint(target: Window) {
  if (target.closed) return false;
  await target.document.fonts.ready;
  target.focus();
  target.addEventListener("afterprint", () => target.close(), { once: true });
  target.print();
  return true;
}
