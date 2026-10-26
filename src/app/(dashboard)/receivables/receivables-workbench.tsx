"use client";

import { Select, SelectOption } from "@/components/ui/select";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { Tabs } from "radix-ui";
import { AlertDialog, Dialog } from "@/components/ui/dialog";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DatePicker, DateRangePicker, type DateRangeValue } from "@/components/date-picker";
import { OrderCombobox } from "../customer-orders/order-combobox";
import { shanghaiToday } from "@/features/customer-orders/schema";
import { paymentSchema, type PaymentRecord, type ReceivableDetail, type ReceivableRow } from "@/features/receivables/schema";
import { matchesSearch, searchIndex } from "@/features/receivables/search";
import { createPayment, deletePayment, getReceivableDetail, queryReceivables } from "./actions";
import styles from "./receivables.module.css";

type Snapshot = { rows: ReceivableRow[]; customers: { code: string; name: string }[] };
const money = (amount: number) => `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankPayment = () => ({ customerCode: "", customerName: "", amount: "", paymentDate: shanghaiToday(), remark: "" });

export function ReceivablesWorkbench({ initial }: { initial: Snapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [keyword, setKeyword] = useState("");
  const [owedOnly, setOwedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jump, setJump] = useState("1");
  const [detail, setDetail] = useState<ReceivableDetail | null>(null);
  const [tab, setTab] = useState("orders");
  const [range, setRange] = useState<DateRangeValue>({ start: "", end: "" });
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [form, setForm] = useState(blankPayment);
  const [deleteTarget, setDeleteTarget] = useState<PaymentRecord | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  const detailTrigger = useRef<HTMLElement | null>(null);
  const paymentTrigger = useRef<HTMLButtonElement | null>(null);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const paymentsTab = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const busy = loading || saving;
  const indexed = useMemo(() => snapshot.rows.map((row) => ({ row, search: searchIndex(row.customerCode, row.customerName) })), [snapshot.rows]);
  const filtered = indexed.filter(({ row, search }) => (!owedOnly || row.receivableAmount > 0) && matchesSearch(search, keyword)).map(({ row }) => row);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const firstPage = Math.max(1, Math.min(currentPage - 2, pages - 4));
  const pageNumbers = Array.from({ length: Math.min(5, pages) }, (_, i) => firstPage + i);
  const detailOrders = (detail?.orders ?? []).filter((order) => (!range.start || order.orderDate >= range.start) && (!range.end || order.orderDate <= range.end));
  const options = useMemo(() => {
    const result = new Map(snapshot.customers.map((customer) => [customer.code, customer]));
    for (const row of snapshot.rows) if (!result.has(row.customerCode)) result.set(row.customerCode, { code: row.customerCode, name: row.customerName });
    return [...result.values()];
  }, [snapshot]);

  function goToPage(next: number) { const value = Math.min(pages, Math.max(1, next)); setPage(value); setJump(String(value)); }
  function resetPage() { setPage(1); setJump("1"); }

  async function refresh() {
    const [next, nextDetail] = await Promise.all([queryReceivables(), detail ? getReceivableDetail(detail.customer.code) : Promise.resolve(null)]);
    setSnapshot(next); if (nextDetail) setDetail(nextDetail); setStale(false);
  }

  function reload() {
    startLoad(async () => { try { await refresh(); } catch { setStale(true); toast.error("加载应收账款失败，请重试"); } });
  }

  function openDetail(row: ReceivableRow, trigger: HTMLElement) {
    if (busy) return;
    detailTrigger.current = trigger;
    startLoad(async () => {
      try { setDetail(await getReceivableDetail(row.customerCode)); setTab("orders"); setRange({ start: "", end: "" }); }
      catch { toast.error("加载客户详情失败，请重试"); }
    });
  }

  function openPayment(fromDetail: boolean, trigger: HTMLButtonElement) {
    paymentTrigger.current = trigger;
    setForm({ ...blankPayment(), customerCode: fromDetail ? detail?.customer.code ?? "" : "", customerName: fromDetail ? detail?.customer.name ?? "" : "" });
    setPaymentOpen(true);
  }

  function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = paymentSchema.safeParse({ ...form, amount: form.amount === "" ? NaN : Number(form.amount) });
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "请检查支付记录"); return; }
    startSave(async () => {
      try {
        const result = await createPayment(parsed.data);
        if (!result.ok) { toast.error(result.message); return; }
        setPaymentOpen(false); toast.success("支付记录已保存");
        try { await refresh(); } catch { setStale(true); toast.error("支付已保存，账款刷新失败，请点击刷新"); }
      } catch { toast.error("保存支付记录失败，请重试"); }
    });
  }

  function confirmDelete() {
    if (!deleteTarget || busy) return;
    startSave(async () => {
      try {
        const result = await deletePayment(deleteTarget.id);
        if (!result.ok) { toast.error(result.message); setDeleteTarget(null); await refresh(); return; }
        setDeleteTarget(null); toast.success("支付记录已删除");
        try { await refresh(); } catch { setStale(true); toast.error("支付已删除，账款刷新失败，请点击刷新"); }
      } catch { toast.error("删除支付记录失败，请重试"); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>应收账款</h1><p>查看客户订单、整柜销售与支付记录，跟进每一笔欠款。</p></div>
      <button className={styles.primaryButton} disabled={busy} onClick={(event) => openPayment(false, event.currentTarget)}><Plus aria-hidden="true" />记录支付</button></header>
    <section className={styles.panel} aria-label="应收账款管理" aria-busy={busy}>
      <div className={styles.filterBar}>
        <div className={styles.segment} role="group" aria-label="账款筛选">
          <button aria-pressed={!owedOnly} onClick={() => { setOwedOnly(false); resetPage(); }}>全部</button>
          <button aria-pressed={owedOnly} onClick={() => { setOwedOnly(true); resetPage(); }}>仅欠款</button>
        </div>
        <div className={styles.search}><Search aria-hidden="true" /><input ref={searchInput} aria-label="搜索客户编号或姓名" value={keyword} placeholder="客户编号、姓名、拼音或首字母" onChange={(event) => { setKeyword(event.target.value); resetPage(); }} />
          {keyword && <button aria-label="清空搜索" onClick={() => { setKeyword(""); resetPage(); }}><X aria-hidden="true" /></button>}</div>
        <button className={styles.secondaryButton} disabled={busy} onClick={reload}><RefreshCw aria-hidden="true" />{loading ? "加载中…" : "刷新"}</button>
      </div>
      {stale && <div role="alert" className={styles.error}>账款数据尚未刷新，请点击“刷新”重试。</div>}
      <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>客户编号</th><th>客户姓名</th><th className={styles.amount}>订单总额</th><th className={styles.amount}>已支付</th><th className={styles.amount}>欠款金额</th><th>操作</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.customerCode}-${index}`} data-selected={detail?.customer.code === row.customerCode || undefined}
          onClick={(event) => openDetail(row, event.currentTarget.querySelector<HTMLButtonElement>("button") ?? event.currentTarget)}>
          <td className={styles.code}>{row.customerCode}</td><td>{row.customerName}</td><td className={styles.amount}>{money(row.totalAmount)}</td><td className={styles.amount}>{money(row.paidAmount)}</td>
          <td className={`${styles.amount} ${row.receivableAmount > 0 ? styles.owed : styles.settled}`}>{money(row.receivableAmount)}</td>
          <td><button className={styles.textButton} disabled={busy} onClick={(event) => { event.stopPropagation(); openDetail(row, event.currentTarget); }}>查看详情</button></td>
        </tr>)}</tbody></table>
        {!rows.length && <div className={styles.empty}><strong>{keyword || owedOnly ? "没有符合条件的账款" : "暂无应收账款"}</strong><span>{keyword || owedOnly ? "调整客户搜索或切换到全部查看。" : "客户订单与整柜销售产生的金额会显示在这里。"}</span></div>}
      </div>
      <div className={styles.pager}>
        <span className={styles.count}>共 {filtered.length} 条</span>
        <label>每页<Select aria-label="每页条数" value={pageSize} onValueChange={(value) => { setPageSize(Number(value)); resetPage(); }} size="sm">{[10, 20, 50, 100].map((size) => <SelectOption key={size} value={size}>{size} 条</SelectOption>)}</Select></label>
        <nav aria-label="账款分页"><button aria-label="上一页" disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)}>‹</button>
          {pageNumbers.map((number) => <button key={number} aria-label={`第 ${number} 页`} aria-current={currentPage === number ? "page" : undefined} onClick={() => goToPage(number)}>{number}</button>)}
          <button aria-label="下一页" disabled={currentPage === pages} onClick={() => goToPage(currentPage + 1)}>›</button></nav>
        <form onSubmit={(event) => { event.preventDefault(); goToPage(Number(jump) || 1); }}><label>跳至<input aria-label="跳转页码" type="number" min={1} max={pages} step={1} value={jump} onChange={(event) => setJump(event.target.value)} />页</label><button>确定</button></form>
      </div>
    </section>

    <Dialog.Root open={Boolean(detail)} onOpenChange={(open) => { if (!open && !saving) setDetail(null); }}><Dialog.Portal><Dialog.Overlay className={styles.backdrop} />
      <Dialog.Content className={styles.dialog} onCloseAutoFocus={(event) => { event.preventDefault(); (detailTrigger.current?.isConnected ? detailTrigger.current : searchInput.current)?.focus(); }}>
        <div className={styles.dialogHeader}><div><Dialog.Title className={styles.dialogTitle}>{detail?.customer.name || "客户"} · 应收账款详情</Dialog.Title>
          <Dialog.Description className={styles.description}>订单总额包含普通订单与整柜销售。日期筛选只影响下方订单列表。</Dialog.Description></div>
          <Dialog.Close asChild><button className={styles.iconButton} aria-label="关闭详情" disabled={saving}><X aria-hidden="true" /></button></Dialog.Close></div>
        {detail && <><dl className={styles.descriptions}>
          <div><dt>客户编号</dt><dd className={styles.code}>{detail.customer.code}</dd></div><div><dt>客户姓名</dt><dd>{detail.customer.name || "—"}</dd></div>
          <div><dt>订单总额</dt><dd>{money(detail.totalAmount)}</dd></div><div><dt>已支付</dt><dd>{money(detail.paidAmount)}</dd></div>
          <div className={styles.balance}><dt>欠款金额</dt><dd className={detail.receivableAmount > 0 ? styles.owed : styles.settled}>{money(detail.receivableAmount)}</dd></div>
        </dl>
        {stale && <div role="alert" className={styles.error}>账款刷新失败。<button className={styles.textButton} disabled={busy} onClick={reload}>重新加载</button></div>}
        <Tabs.Root value={tab} onValueChange={setTab}><Tabs.List className={styles.tabs} aria-label="客户账款明细"><Tabs.Trigger value="orders">订单列表</Tabs.Trigger><Tabs.Trigger ref={paymentsTab} value="payments">支付记录</Tabs.Trigger></Tabs.List>
          <Tabs.Content value="orders"><div className={styles.detailToolbar}><span>按订单日期筛选</span><DateRangePicker label="订单日期范围" value={range} onValueChange={setRange} /></div>
            <div className={styles.detailScroll}><table className={styles.detailTable}><thead><tr><th>订单号</th><th>订单日期</th><th className={styles.amount}>订单金额</th></tr></thead><tbody>
              {detailOrders.map((order) => <tr key={order.id}><td className={styles.code}>{order.orderNo}</td><td>{order.orderDate}</td><td className={styles.amount}>{money(order.orderAmount)}</td></tr>)}
              {!detailOrders.length && <tr><td colSpan={3} className={styles.emptyCell}>暂无符合日期条件的订单</td></tr>}</tbody></table></div></Tabs.Content>
          <Tabs.Content value="payments"><div className={styles.detailScroll}><table className={`${styles.detailTable} ${styles.paymentsTable}`}><thead><tr><th>支付日期</th><th className={styles.amount}>支付金额</th><th>备注</th><th>记录时间</th><th>操作</th></tr></thead><tbody>
            {detail.payments.map((payment) => <tr key={payment.id}><td>{payment.paymentDate}</td><td className={styles.amount}>{money(payment.amount)}</td><td className={styles.remark}>{payment.remark || "—"}</td><td className={styles.timestamp}>{new Date(payment.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</td>
              <td><button className={styles.dangerButton} disabled={busy} onClick={(event) => { deleteTrigger.current = event.currentTarget; setDeleteTarget(payment); }}>删除</button></td></tr>)}
            {!detail.payments.length && <tr><td colSpan={5} className={styles.emptyCell}>暂无支付记录，可点击“记录支付”添加</td></tr>}</tbody></table></div></Tabs.Content>
        </Tabs.Root></>}
        <div className={styles.dialogFooter}><Dialog.Close asChild><button className={styles.secondaryButton} disabled={saving}>关闭</button></Dialog.Close><button className={styles.primaryButton} disabled={busy || stale} onClick={(event) => openPayment(true, event.currentTarget)}><Plus aria-hidden="true" />记录支付</button></div>
      </Dialog.Content></Dialog.Portal></Dialog.Root>

    <Dialog.Root open={paymentOpen} onOpenChange={(open) => { if (!saving) setPaymentOpen(open); }}><Dialog.Portal><Dialog.Overlay className={`${styles.backdrop} ${styles.raisedBackdrop}`} /><Dialog.Content className={`${styles.dialog} ${styles.paymentDialog}`}
      onCloseAutoFocus={(event) => { event.preventDefault(); (paymentTrigger.current?.disabled ? (detail ? paymentsTab.current : searchInput.current) : paymentTrigger.current)?.focus(); }}>
      <div className={styles.dialogHeader}><div><Dialog.Title className={styles.dialogTitle}>记录支付</Dialog.Title><Dialog.Description className={styles.description}>选择或手填客户，记录支付金额、日期和备注。</Dialog.Description></div>
        <Dialog.Close asChild><button className={styles.iconButton} aria-label="关闭支付表单" disabled={saving}><X aria-hidden="true" /></button></Dialog.Close></div>
      <form className={styles.form} onSubmit={submitPayment}>
        <fieldset disabled={saving} className={styles.fields}>
          <div className={styles.field}><label htmlFor="payment-code">客户编号 <span>*</span></label><OrderCombobox id="payment-code" label="客户编号" value={form.customerCode} maxLength={300} options={options} placeholder="输入客户编号、姓名或拼音"
            onChange={(customerCode) => { const match = options.find((option) => option.code === customerCode); setForm((current) => ({ ...current, customerCode, ...(match ? { customerName: match.name } : {}) })); }}
            onSelect={(option) => setForm((current) => ({ ...current, customerCode: option.code, customerName: option.name }))} /></div>
          <div className={styles.field}><label htmlFor="payment-name">客户名称 <span>*</span></label><input id="payment-name" required maxLength={255} value={form.customerName} placeholder="自动带出或手填" onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></div>
          <div className={styles.field}><label htmlFor="payment-amount">支付金额 <span>*</span></label><div className={styles.numberControl}><input id="payment-amount" type="number" required min="0.01" max="9999999999.99" step="0.01" inputMode="decimal" value={form.amount} placeholder="请输入支付金额"
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} /><span>元</span>
            <button type="button" aria-label="支付金额减少100元" onClick={() => setForm((current) => ({ ...current, amount: Math.max(0.01, Number(current.amount) - 100).toFixed(2) }))}>−</button>
            <button type="button" aria-label="支付金额增加100元" onClick={() => setForm((current) => ({ ...current, amount: (Number(current.amount) + 100).toFixed(2) }))}>+</button></div></div>
          <div className={styles.field}><label htmlFor="payment-date">支付日期 <span>*</span></label><DatePicker id="payment-date" label="支付日期" value={form.paymentDate} onValueChange={(paymentDate) => setForm((current) => ({ ...current, paymentDate }))} disabled={saving} /></div>
          <div className={styles.field}><label htmlFor="payment-remark">备注</label><textarea id="payment-remark" rows={3} maxLength={10000} value={form.remark} placeholder="可选，输入备注信息" onChange={(event) => setForm((current) => ({ ...current, remark: event.target.value }))} /></div>
        </fieldset>
        <div className={styles.dialogFooter}><Dialog.Close asChild><button type="button" className={styles.secondaryButton} disabled={saving}>取消</button></Dialog.Close><button className={styles.primaryButton} disabled={busy}>{saving ? "保存中…" : "保存支付"}</button></div>
      </form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !saving) setDeleteTarget(null); }}><AlertDialog.Portal><AlertDialog.Overlay className={`${styles.backdrop} ${styles.raisedBackdrop}`} /><AlertDialog.Content className={`${styles.dialog} ${styles.paymentDialog}`}
      onCloseAutoFocus={(event) => { event.preventDefault(); (deleteTrigger.current?.isConnected && !deleteTrigger.current.disabled ? deleteTrigger.current : paymentsTab.current)?.focus(); }}>
      <AlertDialog.Title className={styles.dialogTitle}>删除支付记录？</AlertDialog.Title><AlertDialog.Description className={styles.description}>将删除 {deleteTarget?.paymentDate} 的 {money(deleteTarget?.amount ?? 0)} 支付记录，并重新计算客户欠款。</AlertDialog.Description>
      <div className={styles.dialogFooter}><AlertDialog.Cancel asChild><button className={styles.secondaryButton} disabled={saving}>取消</button></AlertDialog.Cancel><button className={styles.dangerButton} disabled={busy} onClick={confirmDelete}>{saving ? "删除中…" : "确认删除"}</button></div>
    </AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
