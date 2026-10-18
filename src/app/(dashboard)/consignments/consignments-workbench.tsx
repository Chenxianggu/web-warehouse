"use client";

import { useRef, useState, useTransition } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import { ArchiveRestore, Download, Plus, Printer, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { MaterialCodeCombobox } from "@/components/material-code-combobox";
import type { OrderOptions } from "@/features/customer-orders/schema";
import { emptyFilter, outboundTotal, storageFee, storageSegments, type ConsignmentFilter, type ConsignmentInput, type ConsignmentPage, type ConsignmentRecord } from "@/features/consignments/schema";
import { buildWarehouseNote } from "@/features/consignments/warehouse-note";
import { openDeliveryPrint, triggerDeliveryPrint } from "@/features/outbound/delivery-note";
import { deleteConsignment, listConsignments, saveConsignment } from "./actions";
import styles from "./consignments.module.css";

const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tons = (value: number) => Number(value.toFixed(3)).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
function newRecord(today: string): ConsignmentInput {
  return { id: null, updatedAt: null, orderDate: today, customerName: "", itemCode: "", quantity: 0, unitPrice: 0, arrivalDate: "", storageFeePrice: 0, storageFeeDays: 0, status: "unfinished", remark: "", outboundHistory: [] };
}

export function ConsignmentsWorkbench({ initial, options, today }: { initial: ConsignmentPage; options: OrderOptions; today: string }) {
  const [result, setResult] = useState(initial);
  const [draft, setDraft] = useState(emptyFilter);
  const [filter, setFilter] = useState(emptyFilter);
  const filterRef = useRef(emptyFilter);
  const requestId = useRef(0);
  const [pending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState<ConsignmentInput | null>(null);
  const [sourceLinked, setSourceLinked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState<ConsignmentRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [printRow, setPrintRow] = useState<ConsignmentRecord | null>(null);
  const [hidePrices, setHidePrices] = useState(false);
  const [zoom, setZoom] = useState(110);
  const [exporting, setExporting] = useState(false);
  const [jump, setJump] = useState("1");
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const addButton = useRef<HTMLButtonElement | null>(null);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const hasLinkedHistory = !!form?.outboundHistory.some((entry) => entry.order_id !== undefined);
  const segments = form ? storageSegments(form) : [];

  function load(next: ConsignmentFilter) {
    const request = ++requestId.current;
    filterRef.current = next;
    setFilter(next);
    startTransition(async () => {
      try {
        const data = await listConsignments(next);
        if (request !== requestId.current) return;
        setResult(data); setLoadError(""); setJump(String(data.page));
      } catch { if (request === requestId.current) setLoadError("加载寄存记录失败，请重试"); }
    });
  }
  function edit(row: ConsignmentRecord | null, trigger: HTMLButtonElement) {
    returnFocus.current = trigger;
    setForm(row ? { ...row, outboundHistory: row.outboundHistory.map((entry) => ({ ...entry })) } : newRecord(today));
    setSourceLinked(!!row?.sourceFullContainerId); setFormError("");
  }
  function change<K extends keyof ConsignmentInput>(key: K, value: ConsignmentInput[K]) {
    setForm((current) => current ? { ...current, [key]: value } : current);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!form || saving) return;
    setSaving(true); setFormError("");
    try {
      const saved = await saveConsignment(form);
      if (!saved.ok) { setFormError(saved.message); return; }
      toast.success(form.id ? "更新成功" : "添加成功"); setForm(null); load({ ...filterRef.current, page: 1 });
    } catch { setFormError("保存失败，请重试"); } finally { setSaving(false); }
  }
  async function remove() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const removed = await deleteConsignment(deleting.id, deleting.updatedAt);
      if (!removed.ok) { toast.error(removed.message); load(filterRef.current); return; }
      toast.success("删除成功"); setDeleting(null); load({ ...filterRef.current, page: 1 });
    } catch { toast.error("删除失败，请重试"); } finally { setDeleteBusy(false); }
  }
  async function exportRows() {
    setExporting(true);
    try {
      const params = new URLSearchParams(Object.entries(filterRef.current).map(([key, value]) => [key, String(value)]));
      const response = await fetch(`/consignments/export?${params}`);
      if (!response.ok) { const error = await response.json(); toast.error(error.error || "导出失败"); return; }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `客户寄存_${today}.xlsx`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success("导出成功");
    } catch { toast.error("导出失败，请重试"); } finally { setExporting(false); }
  }
  async function print() {
    if (!printRow) return;
    const target = openDeliveryPrint(buildWarehouseNote(printRow, hidePrices));
    if (!target) { toast.error("请允许浏览器弹出打印窗口"); return; }
    try { await triggerDeliveryPrint(target); } catch { target.close(); toast.error("打印失败，请重试"); }
  }
  function restoreFocus(event: Event) { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : addButton.current)?.focus(); }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>客户寄存</h1><p>记录寄存货物、分次提货与仓租费用。</p></div><ArchiveRestore aria-hidden="true" /></header>
    <section className={styles.panel} aria-label="寄存记录">
      <div className={styles.panelHeader}><div><h2>寄存记录</h2><p>到货日期已到的记录自动标记为已收货。</p></div><div className={styles.actions}><button className={styles.secondary} disabled={exporting || pending} onClick={exportRows}><Download />{exporting ? "导出中…" : "导出"}</button><button ref={addButton} className={styles.primary} onClick={(event) => edit(null, event.currentTarget)}><Plus />新增客户寄存</button></div></div>
      <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); load({ ...draft, page: 1, pageSize: filter.pageSize }); }}>
        <label>订货日期<DatePicker id="consignment-date" label="订货日期筛选" value={draft.date} onValueChange={(value) => setDraft({ ...draft, date: value })} /></label>
        <label>到货日期<DatePicker id="consignment-arrival" label="到货日期筛选" value={draft.arrivalDate} onValueChange={(value) => setDraft({ ...draft, arrivalDate: value })} /></label>
        <label>客户名<input value={draft.customerName} maxLength={255} onChange={(event) => setDraft({ ...draft, customerName: event.target.value })} placeholder="输入客户名" /></label>
        <label>货号<input value={draft.itemCode} maxLength={100} onChange={(event) => setDraft({ ...draft, itemCode: event.target.value })} placeholder="输入货号" /></label>
        <label>是否已收货<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as ConsignmentFilter["status"] })}><option value="">全部</option><option value="unfinished">未收货</option><option value="finished">已收货</option></select></label>
        <button className={styles.primary} disabled={pending}><Search />查询</button><button className={styles.secondary} type="button" disabled={pending} onClick={() => { setDraft(emptyFilter); load({ ...emptyFilter, pageSize: filter.pageSize }); }}>重置</button>
      </form>
      {loadError && <div className={styles.error} role="alert">{loadError}<button onClick={() => load(filterRef.current)}>重试</button></div>}
      <div className={styles.tableScroll} aria-busy={pending} tabIndex={0} aria-label="寄存记录表格，可横向滚动"><table className={styles.table}><thead><tr>{["订货日期", "客户名", "货号", "数量(吨)", "单价", "总金额", "到货日期", "是否已收货", "仓租单价", "仓租总价", "备注", "操作"].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>
        {result.data.map((row) => <tr key={row.id}><td>{row.orderDate}</td><td>{row.customerName || "—"}</td><td className={styles.code}>{row.itemCode}</td><td>{tons(row.quantity)}{outboundTotal(row) > 0 && <small>剩余 {tons(row.quantity - outboundTotal(row))}</small>}</td><td>{money(row.unitPrice)}</td><td>{money(row.amount)}</td><td>{row.arrivalDate || "—"}</td><td><span className={row.status === "finished" ? styles.received : styles.waiting}>{row.status === "finished" ? "已收货" : "未收货"}</span></td><td>{money(row.storageFeePrice)}<small>/吨/天</small></td><td>{money(row.storageFeeTotal)}</td><td className={styles.remark} title={row.remark}>{row.remark || "—"}</td><td><div className={styles.rowActions}><button onClick={(event) => edit(row, event.currentTarget)}>编辑</button><button onClick={(event) => { returnFocus.current = event.currentTarget; setPrintRow(row); setZoom(110); setHidePrices(false); }}>打印</button><button className={styles.dangerText} onClick={(event) => { returnFocus.current = event.currentTarget; setDeleting(row); }}>删除</button></div></td></tr>)}
        {!result.data.length && <tr><td colSpan={12} className={styles.empty}>{pending ? "正在加载…" : "没有符合条件的寄存记录，可重置筛选或新增记录。"}</td></tr>}
      </tbody></table></div>
      <footer className={styles.pagination}><span aria-live="polite">共 {result.total} 条 · 第 {result.page} / {pages} 页</span><label>每页<select value={filter.pageSize} disabled={pending} onChange={(event) => load({ ...filterRef.current, page: 1, pageSize: Number(event.target.value) as ConsignmentFilter["pageSize"] })}>{[10, 20, 50, 100].map((size) => <option key={size}>{size}</option>)}</select>条</label><button disabled={pending || result.page <= 1} onClick={() => load({ ...filterRef.current, page: result.page - 1 })}>上一页</button><button disabled={pending || result.page >= pages} onClick={() => load({ ...filterRef.current, page: result.page + 1 })}>下一页</button><form onSubmit={(event) => { event.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page >= 1 && page <= pages) load({ ...filterRef.current, page }); }}><label>跳至<input aria-label="跳转页码" type="number" min={1} max={pages} value={jump} onChange={(event) => setJump(event.target.value)} /></label><button disabled={pending}>确定</button></form></footer>
    </section>

    <Dialog.Root open={!!form} onOpenChange={(open) => { if (!open && !saving) setForm(null); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={styles.dialog} onCloseAutoFocus={restoreFocus} onInteractOutside={(event) => event.preventDefault()}>
      <div className={styles.dialogHeading}><div><Dialog.Title>{form?.id ? "编辑客户寄存" : "新增客户寄存"}</Dialog.Title><Dialog.Description>填写寄存信息，按每次提货日期与数量分段计仓租。</Dialog.Description></div><Dialog.Close className={styles.iconButton} disabled={saving} aria-label="关闭编辑"><X /></Dialog.Close></div>
      {form && <form onSubmit={submit}><fieldset disabled={saving} className={styles.fields}>
        {sourceLinked && <p className={styles.fullWidth}>此记录来自售整柜货，订货信息请在售整柜货中修改。</p>}
        <label>订货日期 *<DatePicker id="edit-order-date" label="订货日期" value={form.orderDate} onValueChange={(value) => change("orderDate", value)} disabled={sourceLinked || saving} /></label>
        <label>到货日期<DatePicker id="edit-arrival-date" label="到货日期" value={form.arrivalDate} onValueChange={(value) => change("arrivalDate", value)} disabled={saving} /></label>
        <label>客户名<input list="consignment-customers" placeholder="输入客户名/编号搜索" value={form.customerName} maxLength={255} disabled={sourceLinked || hasLinkedHistory} onChange={(event) => { const value = event.target.value; change("customerName", options.customers.find((row) => row.code === value)?.name || value); }} /><datalist id="consignment-customers">{options.customers.map((row) => <option key={row.code} value={row.name}>{row.code} · {row.name}</option>)}</datalist></label>
        <label>仓租单价（元/吨/天）<input type="number" min={0} step="0.01" value={form.storageFeePrice} onChange={(event) => change("storageFeePrice", Number(event.target.value))} /></label>
        <div className={styles.field}><span>货号 *</span><MaterialCodeCombobox value={form.itemCode} onValueChange={(value) => change("itemCode", value)} options={options.materials} label="寄存货号" maxLength={100} disabled={sourceLinked || hasLinkedHistory || saving} /></div>
        <label>仓租天数<input type="number" min={0} step={1} value={form.storageFeeDays} onChange={(event) => change("storageFeeDays", Number(event.target.value))} /><small>无出库记录时按整单计费</small></label>
        <label>数量（吨）<input type="number" min={0} step="0.001" value={form.quantity} disabled={sourceLinked} onChange={(event) => change("quantity", Number(event.target.value))} /></label>
        <label>是否已收货<select value={form.status} disabled={hasLinkedHistory} onChange={(event) => change("status", event.target.value as ConsignmentInput["status"])}><option value="unfinished">未收货</option><option value="finished">已收货</option></select></label>
        <label>单价（元/吨）<input type="number" min={0} step="0.01" value={form.unitPrice} disabled={sourceLinked} onChange={(event) => change("unitPrice", Number(event.target.value))} /></label>
        <label>仓租总价<output>{money(storageFee(form))}</output><small>{segments.length ? segments.map((seg) => `${form.storageFeePrice} × ${tons(seg.quantity)} × ${seg.days}天`).join(" + ") : form.outboundHistory.some((entry) => entry.date && entry.quantity > 0) ? "暂无可计费区间，仓租为零" : `${form.storageFeePrice} × ${tons(form.quantity)} × ${form.storageFeeDays}天`}</small></label>
        <label>总金额<output>{money(form.quantity * form.unitPrice)}</output></label>
        <label>备注<textarea value={form.remark} maxLength={10000} onChange={(event) => change("remark", event.target.value)} rows={2} /></label>
        <div className={`${styles.history} ${styles.fullWidth}`}><div className={styles.historyHeading}><h3>出库记录</h3><button className={styles.secondary} type="button" onClick={() => change("outboundHistory", [...form.outboundHistory, { date: form.arrivalDate || today, quantity: 0 }])}><Plus />添加一行</button></div>
          {!form.outboundHistory.length && <p>尚无出库记录。添加每次提货日期及数量后，按剩余在库数量分段计费。</p>}
          {form.outboundHistory.map((entry, index) => <div className={styles.historyRow} key={index}><div><DatePicker id={`outbound-${index}`} label={`第 ${index + 1} 次出库日期`} value={entry.date} disabled={entry.order_id !== undefined || saving} onValueChange={(date) => change("outboundHistory", form.outboundHistory.map((row, i) => i === index ? { ...row, date } : row))} /></div><label>数量（吨）<input type="number" min="0.001" step="any" value={entry.quantity} disabled={entry.order_id !== undefined} onChange={(event) => change("outboundHistory", form.outboundHistory.map((row, i) => i === index ? { ...row, quantity: Number(event.target.value) } : row))} /></label>{entry.order_id !== undefined ? <small>订单 #{entry.order_id}<br />在订单出库中撤销</small> : <button type="button" className={styles.dangerText} aria-label={`删除第 ${index + 1} 次出库记录`} onClick={() => change("outboundHistory", form.outboundHistory.filter((_, i) => i !== index))}>删除</button>}</div>)}
        </div>
      </fieldset>{formError && <p className={styles.error} role="alert">{formError}</p>}<div className={styles.dialogFooter}><Dialog.Close asChild><button type="button" className={styles.secondary} disabled={saving}>取消</button></Dialog.Close><button className={styles.primary} disabled={saving}>{saving ? "保存中…" : "保存"}</button></div></form>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>

    <AlertDialog.Root open={!!deleting} onOpenChange={(open) => { if (!open && !deleteBusy) setDeleting(null); }}><AlertDialog.Portal><AlertDialog.Overlay className={styles.overlay} /><AlertDialog.Content className={styles.confirmDialog} onCloseAutoFocus={restoreFocus}><AlertDialog.Title>删除寄存记录</AlertDialog.Title><AlertDialog.Description>确定删除 {deleting?.customerName || "该客户"} 的寄存记录（货号：{deleting?.itemCode}）？</AlertDialog.Description><div className={styles.dialogFooter}><AlertDialog.Cancel asChild><button className={styles.secondary} disabled={deleteBusy}>取消</button></AlertDialog.Cancel><button className={styles.danger} disabled={deleteBusy} onClick={remove}>{deleteBusy ? "删除中…" : "确定删除"}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>

    <Dialog.Root open={!!printRow} onOpenChange={(open) => { if (!open) setPrintRow(null); }}><Dialog.Portal><Dialog.Overlay className={styles.overlay} /><Dialog.Content className={`${styles.dialog} ${styles.printDialog}`} onCloseAutoFocus={restoreFocus}><div className={styles.dialogHeading}><div><Dialog.Title>打印寄存仓单</Dialog.Title><Dialog.Description>核对仓单后打印，可隐藏单价与金额。</Dialog.Description></div><Dialog.Close className={styles.iconButton} aria-label="关闭打印预览"><X /></Dialog.Close></div><div className={styles.zoomToolbar}><span>预览缩放</span><button className={styles.iconButton} disabled={zoom <= 50} aria-label="缩小预览" onClick={() => setZoom(Math.max(50, zoom - 10))}><ZoomOut /></button><span>{zoom}%</span><button className={styles.iconButton} disabled={zoom >= 250} aria-label="放大预览" onClick={() => setZoom(Math.min(250, zoom + 10))}><ZoomIn /></button><button className={styles.secondary} onClick={() => setZoom(110)}>重置</button></div><div className={styles.previewScroll}>{printRow && <div style={{ width: 920 * zoom / 100, height: 560 * zoom / 100, margin: "0 auto" }}><iframe title="寄存仓单预览" srcDoc={buildWarehouseNote(printRow, hidePrices)} sandbox="" className={styles.preview} style={{ transform: `scale(${zoom / 100})` }} /></div>}</div><div className={styles.printFooter}><label><input type="checkbox" checked={hidePrices} onChange={(event) => setHidePrices(event.target.checked)} />不显示单价和金额</label><div className={styles.actions}><Dialog.Close asChild><button className={styles.secondary}>取消</button></Dialog.Close><button className={styles.primary} onClick={print}><Printer />打印</button></div></div></Dialog.Content></Dialog.Portal></Dialog.Root>
  </div>;
}
