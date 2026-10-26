"use client";

import { Select, SelectOption } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import { Download, PackageCheck, Printer, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { warehouseLabel, warehouseOptions } from "@/features/inventory/warehouse";
import { lineSubtotal, type OrderRecord } from "@/features/customer-orders/schema";
import { buildDeliveryNote, openDeliveryPrint, triggerDeliveryPrint, ITEMS_PER_PAGE } from "@/features/outbound/delivery-note";
import type { OutboundFilter, OutboundPage } from "@/features/outbound/schema";
import { getOutboundOrder, listOutboundOrders, shipOrder, unshipOrder } from "./actions";
import styles from "./outbound.module.css";

const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function OutboundList({ shipped, today, initial, revision, onDetail, onPrint, onUnship, busy }: {
  shipped: boolean; today: string; initial: OutboundPage; revision: number; busy: boolean;
  onDetail: (order: OrderRecord, trigger: HTMLButtonElement) => void;
  onPrint: (order: OrderRecord, trigger: HTMLButtonElement) => void;
  onUnship: (order: OrderRecord) => void;
}) {
  const [result, setResult] = useState(initial);
  const [filter, setFilter] = useState<OutboundFilter>({ isShipped: shipped, date: today, customer: "", page: 1, pageSize: 10 });
  const filterRef = useRef(filter);
  const requestId = useRef(0);
  const [keyword, setKeyword] = useState("");
  const [jump, setJump] = useState("1");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);
  const title = shipped ? "已出库订单" : "待出库订单";
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstPage = Math.max(1, Math.min(result.page - 2, pages - 4));
  const numbers = Array.from({ length: Math.min(5, pages) }, (_, index) => firstPage + index);

  const load = useCallback((next: OutboundFilter) => {
    const request = ++requestId.current;
    filterRef.current = next;
    setFilter(next);
    startTransition(async () => {
      try {
        const data = await listOutboundOrders(next);
        if (request !== requestId.current) return;
        setResult(data); setJump(String(data.page)); setError(false);
        filterRef.current = { ...next, page: data.page };
        setFilter(filterRef.current);
      } catch { if (request === requestId.current) { setError(true); toast.error(`${title}加载失败，请重试`); } }
    });
  }, [title]);

  useEffect(() => { if (revision) load(filterRef.current); }, [revision, load]);

  async function exportExcel() {
    if (!filter.date) { toast.warning("请先选择日期"); return; }
    setExporting(true);
    try {
      const params = new URLSearchParams({ date: filter.date, customer: keyword.trim() });
      const response = await fetch(`/outbound-orders/export?${params}`);
      if (!response.ok || !response.headers.get("content-type")?.includes("spreadsheetml")) {
        const error = await response.json().catch(() => null);
        toast.error(error?.error || "导出失败，请重试"); return;
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `已出库订单_${filter.date}.xlsx`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("导出成功");
    } catch { toast.error("导出失败，请检查连接后重试"); }
    finally { setExporting(false); }
  }

  return <section className={styles.panel} aria-labelledby={`${shipped ? "shipped" : "pending"}-title`} aria-busy={pending}>
    <header className={styles.panelHeader}><div><h2 id={`${shipped ? "shipped" : "pending"}-title`}>{title}</h2><p>{shipped ? "查看出货记录，重打出货单或取消出库。" : "核对订单后打印出货单，或直接办理出库。"}</p></div>
      <div className={styles.filters}>
        <DatePicker id={`${shipped ? "shipped" : "pending"}-date`} label={`${title}日期`} value={filter.date} onValueChange={(date) => load({ ...filter, date, customer: keyword.trim(), page: 1 })} disabled={pending || busy} />
        <form className={styles.search} onSubmit={(event) => { event.preventDefault(); load({ ...filter, customer: keyword.trim(), page: 1 }); }}>
          <input aria-label={`${title}客户搜索`} placeholder="客户姓名或编号，回车搜索" maxLength={255} value={keyword} disabled={pending || busy}
            onChange={(event) => { const value = event.target.value; setKeyword(value); if (!value) load({ ...filter, customer: "", page: 1 }); }} />
          {keyword && <button type="button" aria-label={`清空${title}客户搜索`} disabled={pending || busy} onClick={() => { setKeyword(""); load({ ...filter, customer: "", page: 1 }); }}><X aria-hidden="true" /></button>}
          <button type="submit" aria-label={`搜索${title}`} disabled={pending || busy}><Search aria-hidden="true" /></button>
        </form>
        {shipped && <button type="button" className={styles.secondaryButton} disabled={exporting || pending || busy} onClick={exportExcel}><Download aria-hidden="true" />{exporting ? "导出中…" : "导出Excel"}</button>}
      </div>
    </header>
    {error ? <div className={styles.empty}><strong>订单加载失败</strong><button className={styles.secondaryButton} disabled={pending} onClick={() => load(filter)}>重新加载</button></div> :
      <div className={styles.tableGrow}><table className={styles.table}><thead><tr><th>订单号</th><th>客户编号</th><th>客户姓名</th><th>订单日期</th><th>出库仓库</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{result.data.map((order) => <tr key={order.id} onClick={(event) => {
          if (pending || busy || (event.target as HTMLElement).closest("button")) return;
          const button = event.currentTarget.querySelector("button"); if (button) onDetail(order, button);
        }}>
          <td><button className={styles.orderLink} disabled={pending || busy} onClick={(event) => onDetail(order, event.currentTarget)} aria-label={`查看订单 ${order.orderNo}`}>{order.orderNo}</button></td>
          <td className={styles.code}>{order.customerCode}</td><td>{order.customerName}</td><td className={styles.date}>{order.orderDate}</td><td>{warehouseLabel(order.warehouse)}</td>
          <td><span className={styles.status} data-shipped={shipped}>{shipped ? "已出库" : "未出库"}</span></td>
          <td><div className={styles.rowActions}><button className={styles.secondaryButton} disabled={pending || busy} aria-label={`打印订单 ${order.orderNo}`} onClick={(event) => onPrint(order, event.currentTarget)}><Printer aria-hidden="true" />打印</button>
          {shipped && <button className={styles.dangerButton} disabled={pending || busy} aria-label={`取消出库 ${order.orderNo}`} onClick={() => onUnship(order)}>取消出库</button>}</div></td>
        </tr>)}</tbody>
      </table>{!result.data.length && <div className={styles.empty}><PackageCheck aria-hidden="true" /><strong>暂无{shipped ? "已出库" : "待出库"}订单</strong><span>可调整日期或客户搜索条件。</span></div>}</div>}
    <footer className={styles.pager}><span className={styles.totalCount}>共 {result.total} 笔</span><label>每页 <Select aria-label={`${title}每页条数`} value={filter.pageSize} disabled={pending || busy} onValueChange={(value) => load({ ...filter, page: 1, pageSize: Number(value) as OutboundFilter["pageSize"] })} size="sm">{[10, 20, 50, 100].map((size) => <SelectOption value={size} key={size}>{size}</SelectOption>)}</Select> 笔</label>
      <nav aria-label={`${title}分页`}><button disabled={pending || busy || result.page <= 1} aria-label={`${title}上一页`} onClick={() => load({ ...filter, page: result.page - 1 })}>‹</button>
      {numbers.map((page) => <button key={page} disabled={pending || busy} aria-current={page === result.page ? "page" : undefined} onClick={() => load({ ...filter, page })}>{page}</button>)}
      <button disabled={pending || busy || result.page >= pages} aria-label={`${title}下一页`} onClick={() => load({ ...filter, page: result.page + 1 })}>›</button></nav>
      <form onSubmit={(event) => { event.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page > 0) load({ ...filter, page: Math.min(page, pages) }); }}><label>跳至 <input aria-label={`${title}跳转页码`} type="number" min={1} max={pages} value={jump} disabled={pending || busy} onChange={(event) => setJump(event.target.value)} /> 页</label><button type="submit" disabled={pending || busy}>跳转</button></form>
    </footer>
  </section>;
}

export function OutboundWorkbench({ today, initialPending, initialShipped }: { today: string; initialPending: OutboundPage; initialShipped: OutboundPage }) {
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<OrderRecord | null>(null);
  const [printOrder, setPrintOrder] = useState<OrderRecord | null>(null);
  const [unshipTarget, setUnshipTarget] = useState<OrderRecord | null>(null);
  const [hidePrices, setHidePrices] = useState(false);
  const [zoom, setZoom] = useState(110);
  const [frameHeight, setFrameHeight] = useState(560);
  const [busy, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const previewHtml = useMemo(() => printOrder ? buildDeliveryNote(printOrder, hidePrices) : "", [printOrder, hidePrices]);

  function closePrint() { setPrintOrder(null); setHidePrices(false); setZoom(110); setFrameHeight(560); }
  function openOrder(order: OrderRecord, trigger: HTMLButtonElement, print = false) {
    triggerRef.current = trigger;
    startTransition(async () => {
      try {
        const fresh = await getOutboundOrder(order.id);
        if (!fresh) { toast.error("订单不存在或已被删除"); setRevision((value) => value + 1); return; }
        if (print) { setPrintOrder(fresh); setFrameHeight(Math.ceil(fresh.items.length / ITEMS_PER_PAGE) * 560); }
        else setDetail(fresh);
      } catch { toast.error("加载订单详情失败，请重试"); }
    });
  }

  function confirmShip(print: boolean) {
    if (!printOrder) return;
    const order = printOrder;
    // Reserve the popup during the user's click so awaiting shipment cannot
    // cause a browser popup blocker to suppress the print window.
    const printWindow = print ? openDeliveryPrint(previewHtml) : null;
    startTransition(async () => {
      let shipped = order.isShipped;
      try {
        if (!shipped) {
          const result = await shipOrder(order.id, order.warehouse);
          if (!result.ok) { printWindow?.close(); toast.error(result.message); closePrint(); setRevision((value) => value + 1); return; }
          shipped = true;
          setRevision((value) => value + 1);
          if (result.warnings.length) toast.warning(result.warnings.join("；"), { duration: 8000 });
        }
        if (print) {
          if (printWindow && await triggerDeliveryPrint(printWindow)) toast.success(order.isShipped ? "已打开打印窗口" : "订单已出库，已打开打印窗口");
          else toast.warning(order.isShipped ? "无法打开打印窗口，请检查弹窗拦截后重试" : "订单已出库，但未能打开打印窗口，可在已出库订单中重新打印");
        } else toast.success("订单已出库");
        closePrint();
      } catch {
        printWindow?.close();
        toast.error(shipped ? "订单已出库，打印未完成，可在已出库订单中重新打印" : "出库失败，请检查连接后重试");
        if (shipped) { setRevision((value) => value + 1); closePrint(); }
      }
    });
  }

  function confirmUnship() {
    if (!unshipTarget) return;
    const id = unshipTarget.id;
    startTransition(async () => {
      try {
        const result = await unshipOrder(id);
        if (!result.ok) toast.error(result.message);
        else toast.success("订单已取消出库并回滚库存");
        setUnshipTarget(null); setRevision((value) => value + 1);
      } catch { toast.error("取消出库失败，请重试"); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>发货出库</h1><p>核对客户订单、打印出货单，办理出库与回库。</p></div><PackageCheck aria-hidden="true" /></header>
    <div className={styles.lists}>{[false, true].map((shipped) => <OutboundList key={String(shipped)} shipped={shipped} today={today} initial={shipped ? initialShipped : initialPending} revision={revision} busy={busy}
      onDetail={(order, trigger) => openOrder(order, trigger)} onPrint={(order, trigger) => openOrder(order, trigger, true)} onUnship={setUnshipTarget} />)}</div>

    <Dialog.Root open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}><Dialog.Portal><Dialog.Overlay className={styles.backdrop} /><Dialog.Content className={styles.dialog} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
      <header className={styles.dialogHeader}><div><Dialog.Title className={styles.dialogTitle}>订单详情</Dialog.Title><Dialog.Description className={styles.dialogDescription}>{detail?.isShipped ? "已出库" : "未出库"} · 核对客户与塑料明细。</Dialog.Description></div><Dialog.Close asChild><button className={styles.iconButton} aria-label="关闭订单详情"><X aria-hidden="true" /></button></Dialog.Close></header>
      {detail && <><dl className={styles.descriptions}><div><dt>订单号</dt><dd className={styles.code}>{detail.orderNo}</dd></div><div><dt>订单日期</dt><dd>{detail.orderDate}</dd></div><div><dt>客户编号</dt><dd>{detail.customerCode}</dd></div><div><dt>客户姓名</dt><dd>{detail.customerName}</dd></div><div><dt>收货单位</dt><dd>{detail.receiver}</dd></div><div><dt>出库仓库</dt><dd>{warehouseLabel(detail.warehouse)}</dd></div><div><dt>创建时间</dt><dd>{new Date(detail.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</dd></div></dl>
        <h3 className={styles.detailSubtitle}>订单明细</h3><div className={styles.detailScroll}><table className={styles.detailTable}><thead><tr><th>塑料编号</th><th>塑料名称</th><th>包数</th><th>单价</th><th>小计</th></tr></thead><tbody>{detail.items.map((item, index) => <tr key={index}><td className={styles.code}>{item.code}</td><td>{item.name}</td><td>{item.packCount}</td><td>{money(item.unitPrice)}</td><td>{money(lineSubtotal(item))}</td></tr>)}</tbody></table></div>
        <p className={styles.total}>合计：<strong>{money(detail.items.reduce((sum, item) => sum + lineSubtotal(item), 0))}</strong></p></>}
      <footer className={styles.dialogFooter}><Dialog.Close asChild><button className={styles.primaryButton}>关闭</button></Dialog.Close></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <Dialog.Root open={printOrder !== null} onOpenChange={(open) => { if (!open && !busy) closePrint(); }}><Dialog.Portal><Dialog.Overlay className={styles.backdrop} /><Dialog.Content className={`${styles.dialog} ${styles.printDialog}`} onInteractOutside={(event) => event.preventDefault()} onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
      <header className={styles.dialogHeader}><div><Dialog.Title className={styles.dialogTitle}>{printOrder?.isShipped ? "打印出货单（已出库·仅打印）" : "打印订单"}</Dialog.Title><Dialog.Description className={styles.dialogDescription}>{printOrder?.orderNo} · 每张最多 5 种塑料，超出自动分页。</Dialog.Description></div><button className={styles.iconButton} disabled={busy} aria-label="关闭打印预览" onClick={closePrint}><X aria-hidden="true" /></button></header>
      <fieldset className={styles.warehouseField} disabled={busy || printOrder?.isShipped}><legend>出库仓库</legend><div>{warehouseOptions.map((option) => <label className={styles.checkbox} key={option.value}><input type="radio" name="ship-warehouse" checked={printOrder?.warehouse === option.value} onChange={() => setPrintOrder((current) => current ? { ...current, warehouse: option.value } : current)} />{option.label}</label>)}</div></fieldset>
      <div className={styles.zoomToolbar}><span>预览缩放</span><button className={styles.iconButton} disabled={zoom <= 50 || busy} aria-label="缩小预览" onClick={() => setZoom((value) => Math.max(50, value - 10))}><ZoomOut aria-hidden="true" /></button><button className={styles.iconButton} disabled={zoom >= 250 || busy} aria-label="放大预览" onClick={() => setZoom((value) => Math.min(250, value + 10))}><ZoomIn aria-hidden="true" /></button><output aria-live="polite">{zoom}%</output><button className={styles.textButton} disabled={busy} onClick={() => setZoom(110)}>重置</button></div>
      <div className={styles.previewScroll}><div className={styles.previewCanvas} style={{ width: 920 * zoom / 100, height: frameHeight * zoom / 100 }}>
        <iframe title="出货单打印预览" sandbox="allow-same-origin" srcDoc={previewHtml} style={{ width: 920, height: frameHeight, transform: `scale(${zoom / 100})` }}
          onLoad={(event) => { const doc = event.currentTarget.contentDocument; if (doc) setFrameHeight(Math.max(560, doc.documentElement.scrollHeight, doc.body.scrollHeight)); }} />
      </div></div>
      <footer className={styles.printFooter}><label className={styles.checkbox}><input type="checkbox" checked={hidePrices} disabled={busy} onChange={(event) => setHidePrices(event.target.checked)} />不显示单价和金额（含合计）</label><div className={styles.footerActions}>
        <button className={styles.secondaryButton} disabled={busy} onClick={closePrint}>{printOrder?.isShipped ? "关闭" : "取消"}</button>
        {!printOrder?.isShipped && <button className={styles.secondaryButton} disabled={busy} onClick={() => confirmShip(false)}>仅出库</button>}
        <button className={styles.primaryButton} disabled={busy} onClick={() => confirmShip(true)}><Printer aria-hidden="true" />{busy ? "处理中…" : printOrder?.isShipped ? "确认打印" : "确认打印并出库"}</button>
      </div></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <AlertDialog.Root open={unshipTarget !== null} onOpenChange={(open) => { if (!open && !busy) setUnshipTarget(null); }}><AlertDialog.Portal><AlertDialog.Overlay className={styles.backdrop} /><AlertDialog.Content className={`${styles.dialog} ${styles.confirmDialog}`}>
      <AlertDialog.Title className={styles.dialogTitle}>确认取消出库</AlertDialog.Title><AlertDialog.Description className={styles.dialogDescription}>确定要将订单 {unshipTarget?.orderNo} 取消出库吗？取消后将回补{unshipTarget && warehouseLabel(unshipTarget.warehouse)}库存并回滚该订单的寄仓扣减，订单可重新调整。</AlertDialog.Description>
      <footer className={styles.dialogFooter}><AlertDialog.Cancel asChild><button className={styles.secondaryButton} disabled={busy}>取消</button></AlertDialog.Cancel><button className={styles.dangerButton} disabled={busy} onClick={confirmUnship}>{busy ? "处理中…" : "确定取消出库"}</button></footer>
    </AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
