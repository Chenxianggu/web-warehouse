"use client";

import { Select, SelectOption } from "@/components/ui/select";
import { useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ClipboardList, RotateCcw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/date-picker";
import { lineSubtotal, type OrderRecord } from "@/features/customer-orders/schema";
import { emptyOrderSearch, orderSearchSchema, type OrderSearchFilter, type OrderSearchPage } from "@/features/order-search/schema";
import { getSearchOrder, queryOrders } from "./actions";
import styles from "./order-search.module.css";

const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrderSearchWorkbench({ initial }: { initial: OrderSearchPage }) {
  const [filters, setFilters] = useState(emptyOrderSearch);
  const [result, setResult] = useState(initial);
  const [pageSize, setPageSize] = useState<OrderSearchFilter["pageSize"]>(20);
  const [jump, setJump] = useState("1");
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OrderRecord | null>(null);
  const [loading, startQuery] = useTransition();
  const [detailLoading, startDetail] = useTransition();
  const lastQuery = useRef<OrderSearchFilter>({ ...emptyOrderSearch, page: 1, pageSize: 20 });
  const requestId = useRef(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const busy = loading || detailLoading;
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const firstPage = Math.max(1, Math.min(result.page - 2, pages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pages) }, (_, index) => firstPage + index);

  function load(next: OrderSearchFilter) {
    const parsed = orderSearchSchema.safeParse(next);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message || "请检查查询条件"); return; }
    lastQuery.current = parsed.data;
    const request = ++requestId.current;
    startQuery(async () => {
      try {
        const data = await queryOrders(parsed.data);
        if (request !== requestId.current) return;
        setResult(data); setJump(String(data.page)); setPageSize(data.pageSize as OrderSearchFilter["pageSize"]); setError(false);
        setSelectedId((current) => data.data.some((order) => order.id === current) ? current : null);
      } catch {
        if (request !== requestId.current) return;
        setResult({ data: [], total: 0, page: 1, pageSize: next.pageSize });
        setJump("1"); setError(true); toast.error("查询订单失败，请检查连接后重试");
      }
    });
  }

  function openDetail(order: OrderRecord, trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSelectedId(order.id);
    startDetail(async () => {
      try {
        const fresh = await getSearchOrder(order.id);
        if (!fresh) { toast.error("订单不存在或已被删除"); load(lastQuery.current); return; }
        setDetail(fresh);
      } catch { toast.error("加载订单详情失败，请重试"); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>订单查询</h1><p>按订单号、客户和日期范围查找订单，查看明细与出库状态。</p></div><ClipboardList aria-hidden="true" /></header>
    <section className={styles.panel} aria-label="订单查询结果" aria-busy={busy}>
      <form className={styles.filterBar} onSubmit={(event) => { event.preventDefault(); load({ ...filters, page: 1, pageSize }); }}>
        <div className={styles.field}><label htmlFor="search-order-no">订单号</label><div className={styles.inputControl}><input id="search-order-no" value={filters.orderNo} placeholder="输入订单号" maxLength={50} disabled={busy} onChange={(event) => setFilters((current) => ({ ...current, orderNo: event.target.value }))} />
          {filters.orderNo && <button type="button" aria-label="清空订单号" disabled={busy} onClick={() => setFilters((current) => ({ ...current, orderNo: "" }))}><X aria-hidden="true" /></button>}</div></div>
        <div className={styles.field}><label htmlFor="search-customer">客户编号/姓名</label><div className={styles.inputControl}><input id="search-customer" value={filters.customer} placeholder="输入客户编号或姓名" maxLength={255} disabled={busy} onChange={(event) => setFilters((current) => ({ ...current, customer: event.target.value }))} />
          {filters.customer && <button type="button" aria-label="清空客户关键词" disabled={busy} onClick={() => setFilters((current) => ({ ...current, customer: "" }))}><X aria-hidden="true" /></button>}</div></div>
        <div className={`${styles.field} ${styles.dateField}`}><label htmlFor="search-order-range">订单日期范围</label><DateRangePicker id="search-order-range" label="订单日期范围" value={{ start: filters.startDate, end: filters.endDate }} disabled={busy}
          onValueChange={(value) => setFilters((current) => ({ ...current, startDate: value.start, endDate: value.end }))} /></div>
        <div className={styles.filterActions}><button className={styles.primaryButton} type="submit" disabled={busy}><Search aria-hidden="true" />{loading ? "查询中…" : "查询"}</button>
          <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => { setFilters(emptyOrderSearch); setSelectedId(null); load({ ...emptyOrderSearch, page: 1, pageSize }); }}><RotateCcw aria-hidden="true" />重置</button></div>
      </form>
      <div className={styles.resultsHeader}><h2>订单记录</h2><span aria-live="polite">{loading ? "正在查询…" : error ? "加载失败" : `共 ${result.total} 笔订单`}</span></div>
      {error ? <div className={styles.empty}><strong>查询订单失败</strong><span>请检查连接后重新加载。</span><button className={styles.secondaryButton} disabled={busy} onClick={() => load(lastQuery.current)}>重新加载</button></div> :
      <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>订单号</th><th>客户编号</th><th>客户姓名</th><th>收货单位</th><th>订单日期</th><th>状态</th></tr></thead>
        <tbody>{result.data.map((order) => <tr key={order.id} data-selected={selectedId === order.id || undefined} onClick={(event) => {
          if (busy || (event.target as HTMLElement).closest("button")) return;
          const button = event.currentTarget.querySelector("button"); if (button) openDetail(order, button);
        }}>
          <td><button type="button" className={styles.orderLink} disabled={busy} aria-label={`查看订单 ${order.orderNo}`} onClick={(event) => openDetail(order, event.currentTarget)}>{order.orderNo}</button></td>
          <td className={styles.code}>{order.customerCode}</td><td>{order.customerName}</td><td><span className={styles.receiver} title={order.receiver}>{order.receiver}</span></td><td className={styles.date}>{order.orderDate}</td><td><span className={styles.status} data-shipped={order.isShipped}>{order.isShipped ? "已出库" : "未出库"}</span></td>
        </tr>)}</tbody></table>
        {!result.data.length && <div className={styles.empty}><ClipboardList aria-hidden="true" /><strong>暂无匹配订单</strong><span>可调整查询条件，或重置查看全部订单。</span></div>}
      </div>}
      <footer className={styles.pager}><span className={styles.totalCount}>共 {result.total} 笔</span><label>每页 <Select aria-label="订单查询每页条数" value={pageSize} disabled={busy} onValueChange={(value) => {
        const size = Number(value) as OrderSearchFilter["pageSize"];
        setPageSize(size); load({ ...filters, page: 1, pageSize: size });
      }} size="sm">{[10, 20, 50, 100].map((size) => <SelectOption key={size} value={size}>{size}</SelectOption>)}</Select> 笔</label>
        <nav aria-label="订单查询分页"><button aria-label="订单查询上一页" disabled={busy || result.page <= 1} onClick={() => load({ ...filters, page: result.page - 1, pageSize })}>‹</button>
          {pageNumbers.map((page) => <button key={page} aria-current={page === result.page ? "page" : undefined} disabled={busy} onClick={() => load({ ...filters, page, pageSize })}>{page}</button>)}
          <button aria-label="订单查询下一页" disabled={busy || result.page >= pages} onClick={() => load({ ...filters, page: result.page + 1, pageSize })}>›</button></nav>
        <form onSubmit={(event) => { event.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page > 0) load({ ...filters, page: Math.min(page, pages), pageSize }); }}><label>跳至 <input aria-label="订单查询跳转页码" type="number" min={1} max={pages} value={jump} disabled={busy} onChange={(event) => setJump(event.target.value)} /> 页</label><button type="submit" disabled={busy}>跳转</button></form>
      </footer>
    </section>
    <Dialog.Root open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}><Dialog.Portal><Dialog.Overlay className={styles.backdrop} /><Dialog.Content className={styles.dialog} onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }}>
      <header className={styles.dialogHeader}><div><Dialog.Title className={styles.dialogTitle}>订单详情 - {detail?.orderNo}</Dialog.Title><Dialog.Description className={styles.dialogDescription}>查看客户信息、订单状态和塑料明细。</Dialog.Description></div><Dialog.Close asChild><button className={styles.iconButton} aria-label="关闭订单详情"><X aria-hidden="true" /></button></Dialog.Close></header>
      {detail && <><dl className={styles.descriptions}><div><dt>订单号</dt><dd className={styles.code}>{detail.orderNo}</dd></div><div><dt>订单日期</dt><dd>{detail.orderDate}</dd></div><div><dt>客户编号</dt><dd>{detail.customerCode}</dd></div><div><dt>客户姓名</dt><dd>{detail.customerName}</dd></div><div className={styles.receiverDetail}><dt>收货单位</dt><dd>{detail.receiver}</dd></div><div><dt>状态</dt><dd><span className={styles.status} data-shipped={detail.isShipped}>{detail.isShipped ? "已出库" : "未出库"}</span></dd></div><div><dt>创建时间</dt><dd>{new Date(detail.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</dd></div></dl>
        <h3 className={styles.detailSubtitle}>订单明细</h3><div className={styles.detailScroll}><table className={styles.detailTable}><thead><tr><th>塑料编号</th><th>塑料名称</th><th>包数</th><th>单价</th><th>备注</th><th>小计</th></tr></thead><tbody>{detail.items.map((item, index) => <tr key={index}><td className={styles.code}>{item.code}</td><td>{item.name}</td><td>{item.packCount}</td><td>{money(item.unitPrice)}</td><td><span className={styles.remark} title={item.remark}>{item.remark || "—"}</span></td><td>{money(lineSubtotal(item))}</td></tr>)}</tbody></table></div>
        <p className={styles.total}>合计：<strong>{money(detail.items.reduce((sum, item) => sum + lineSubtotal(item), 0))}</strong></p></>}
      <footer className={styles.dialogFooter}><Dialog.Close asChild><button className={styles.primaryButton}>关闭</button></Dialog.Close></footer>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
