"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { Dialog, AlertDialog } from "radix-ui";
import { Download, Plus, Search, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { warehouseLabel, warehouseOptions, type Warehouse } from "@/features/inventory/warehouse";
import { MaterialCodeCombobox } from "@/components/material-code-combobox";
import { SearchCombobox } from "@/components/search-combobox";
import { emptyPurchaseFilter, type PurchaseInput, type PurchaseFilter, type PurchasePage, type PurchaseRecord, type DeliveryRecord } from "@/features/purchase-orders/schema";
import { listPurchaseOrders, purchaseOptions, savePurchaseOrder, deletePurchaseOrder, addDelivery, deleteDelivery } from "./actions";
import base from "../consignments/consignments.module.css";
import styles from "./purchase.module.css";

const money = (n: number) => `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tons = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
type Options = Awaited<ReturnType<typeof purchaseOptions>>;
function emptyForm(today: string): PurchaseInput { return { id: null, updatedAt: null, orderDate: today, supplier: "", itemCode: "", category: "", quantity: 0, unitPrice: 0, taxIncluded: false, warehouse: "MAIN", remittanceInCompany: "", remittanceOutCompany: "", remittanceDate: "", arrivalDate: "", deliveryInfo: "", status: "unfinished", remark: "" }; }

export function PurchaseWorkbench({ initial, options, today }: { initial: PurchasePage; options: Options; today: string }) {
  const [result, setResult] = useState(initial);
  const [draft, setDraft] = useState(emptyPurchaseFilter);
  const [filter, setFilter] = useState(emptyPurchaseFilter);
  const filterRef = useRef(filter); const requestId = useRef(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(""); const [formError, setFormError] = useState("");
  const [form, setForm] = useState<PurchaseInput | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [savedWarehouse, setSavedWarehouse] = useState<Warehouse>("MAIN");
  const [warehouseLocked, setWarehouseLocked] = useState(false);
  const [newDelivery, setNewDelivery] = useState({ date: "", quantity: "" });
  const [busy, setBusy] = useState(false); const [exporting, setExporting] = useState(false);
  const [categories, setCategories] = useState(options.categories);
  const supplierOptions = useMemo(() => options.suppliers.map((supplier) => ({ id: supplier.id, value: supplier.name, label: supplier.name, description: supplier.code === supplier.name ? undefined : supplier.code })), [options.suppliers]);
  const categoryOptions = useMemo(() => categories.map((category) => ({ id: category, value: category, label: category })), [categories]);
  const [confirmation, setConfirmation] = useState<{ kind: "order"; row: PurchaseRecord } | { kind: "delivery"; row: DeliveryRecord } | null>(null);
  const [jump, setJump] = useState("1");
  const returnFocus = useRef<HTMLButtonElement | null>(null); const addButton = useRef<HTMLButtonElement | null>(null);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const dueSum = deliveries.filter((d) => d.deliveryDate <= today).reduce((sum, d) => sum + d.quantity, 0);
  const registered = deliveries.reduce((sum, d) => sum + d.quantity, 0);

  function load(next: PurchaseFilter) {
    const request = ++requestId.current; filterRef.current = next; setFilter(next);
    startTransition(async () => { try { const data = await listPurchaseOrders(next); if (request !== requestId.current) return; setResult(data); setError(""); setJump(String(data.page)); } catch { if (request === requestId.current) setError("加载订货列表失败，请重试"); } });
  }
  function edit(row: PurchaseRecord | null, trigger: HTMLButtonElement) {
    returnFocus.current = trigger; setForm(row ? { ...row, status: row.effectiveStatus } : emptyForm(today));
    setSavedWarehouse(row?.warehouse ?? "MAIN");
    setWarehouseLocked(!!row && (row.effectiveStatus === "finished" || row.deliveries.some((d) => d.synced)));
    setDeliveries(row?.deliveries || []); setNewDelivery({ date: "", quantity: "" }); setFormError("");
  }
  function change<K extends keyof PurchaseInput>(key: K, value: PurchaseInput[K]) { setForm((current) => current ? { ...current, [key]: value } : current); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form || busy) return; setBusy(true); setFormError("");
    try { const result = await savePurchaseOrder(form); if (!result.ok) { setFormError(result.message); return; } toast.success(form.id ? "更新成功" : "添加成功"); setForm(null); const refreshed = await purchaseOptions().catch(() => null); if (refreshed) setCategories(refreshed.categories); load({ ...filterRef.current, page: form.id ? filterRef.current.page : 1 }); } catch { setFormError("保存失败，请重试"); } finally { setBusy(false); }
  }
  function acceptDeliveryUpdate(record: PurchaseRecord) {
    setDeliveries(record.deliveries);
    setSavedWarehouse(record.warehouse);
    setWarehouseLocked(record.effectiveStatus === "finished" || record.deliveries.some((d) => d.synced));
    // Keep unsaved form fields while updating the server version and receipt
    // status changed by this immediate batch operation.
    setForm((current) => current ? { ...current, warehouse: record.warehouse, updatedAt: record.updatedAt, arrivalDate: record.arrivalDate, status: record.effectiveStatus } : current);
    load(filterRef.current);
  }
  async function addBatch() {
    if (!form?.id || busy) return;
    if (form.warehouse !== savedWarehouse) { setFormError("请先保存入库仓库，再登记分批发货"); return; }
    if (!newDelivery.date || !Number(newDelivery.quantity)) { setFormError("请填写到货日期和本次数量"); return; }
    setBusy(true); setFormError("");
    try { const result = await addDelivery({ orderId: form.id, updatedAt: form.updatedAt, deliveryDate: newDelivery.date, quantity: Number(newDelivery.quantity) }); if (!result.ok) { setFormError(result.message); return; } toast.success(result.message); acceptDeliveryUpdate(result.record); setNewDelivery({ date: "", quantity: "" }); } catch { setFormError("添加分批失败，请重试"); } finally { setBusy(false); }
  }
  async function confirmDelete() {
    if (!confirmation || busy) return; setBusy(true);
    try {
      if (confirmation.kind === "order") { const deleted = await deletePurchaseOrder(confirmation.row.id, confirmation.row.updatedAt); if (!deleted.ok) { toast.error(deleted.message); return; } load({ ...filterRef.current, page: 1 }); const refreshed = await purchaseOptions().catch(() => null); if (refreshed) setCategories(refreshed.categories); }
      else { if (!form?.id || !form.updatedAt) return; const deleted = await deleteDelivery(form.id, confirmation.row.id, form.updatedAt); if (!deleted.ok) { toast.error(deleted.message); return; } acceptDeliveryUpdate(deleted.record); }
      toast.success("删除成功"); setConfirmation(null);
    } catch { toast.error("删除失败，请重试"); } finally { setBusy(false); }
  }
  async function exportRows() {
    setExporting(true);
    try { const response = await fetch(`/purchase-orders/export?${new URLSearchParams(Object.entries(filterRef.current).map(([key, value]) => [key, String(value)]))}`); if (!response.ok) { toast.error((await response.json()).error || "导出失败"); return; }
      if (!response.headers.get("Content-Type")?.includes("spreadsheetml")) { toast.error("登录状态已失效，请刷新后重试"); return; }
      const url = URL.createObjectURL(await response.blob()); const a = document.createElement("a"); a.href = url; a.download = ["订货记录", filterRef.current.date, filterRef.current.supplier].filter(Boolean).join("_").replace(/[\\/:*?"<>|]/g, "_") + ".xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast.success("导出成功");
    } catch { toast.error("导出失败，请重试"); } finally { setExporting(false); }
  }
  function restoreFocus(event: Event) { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : addButton.current)?.focus(); }

  return <div className={`${base.page} ${base.fitPage}`}>
    <header className={base.hero}><div><h1>订货管理</h1><p>管理采购订货、分批交货与入库记录。</p></div><ShoppingCart aria-hidden="true" /></header>
    <section className={base.panel} aria-label="订货记录">
      <div className={base.panelHeader}><div><h2>订货记录</h2><p>到货日期已到时自动入库，分批货物按每次到货数量入库。</p></div><div className={base.actions}><button className={base.secondary} disabled={exporting || pending} onClick={exportRows}><Download />{exporting ? "导出中…" : "导出"}</button><button ref={addButton} className={base.primary} onClick={(e) => edit(null, e.currentTarget)}><Plus />新增订货</button></div></div>
      <form className={`${base.filters} ${styles.filters}`} onSubmit={(e) => { e.preventDefault(); load({ ...draft, page: 1, pageSize: filter.pageSize }); }}>
        <label>订货日期<DatePicker id="purchase-date" label="订货日期筛选" value={draft.date} onValueChange={(date) => setDraft({ ...draft, date })} /></label>
        <label>到货日期<DatePicker id="purchase-arrival" label="到货日期筛选" value={draft.arrivalDate} onValueChange={(arrivalDate) => setDraft({ ...draft, arrivalDate })} /></label>
        <label>供货方<input value={draft.supplier} maxLength={255} placeholder="输入供货方" onChange={(e) => setDraft({ ...draft, supplier: e.target.value })} /></label>
        <label>货号<input value={draft.itemCode} maxLength={100} placeholder="输入货号" onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })} /></label>
        <label>类别<select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}><option value="">全部</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>是否已交货<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as PurchaseFilter["status"] })}><option value="">全部</option><option value="unfinished">未交货</option><option value="finished">已交货</option></select></label>
        <button className={base.primary} disabled={pending}><Search />查询</button><button type="button" className={base.secondary} disabled={pending} onClick={() => { setDraft(emptyPurchaseFilter); load({ ...emptyPurchaseFilter, pageSize: filter.pageSize }); }}>重置</button>
      </form>
      {error && <p className={base.error} role="alert">{error}<button onClick={() => load(filterRef.current)}>重试</button></p>}
      <div className={base.tableScroll} tabIndex={0} aria-label="订货记录表格，可横向滚动" aria-busy={pending}><table className={`${base.table} ${styles.table}`}><thead><tr>{["订货日期", "供货方", "货号", "类别", "入库仓库", "数量(吨)", "单价", "金额", "是否￥", "配送日期/方式", "到货日期", "是否已交货", "备注", "操作"].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
        {result.data.map((row) => <tr key={row.id} data-delivered={row.effectiveStatus === "finished" || undefined}><td>{row.orderDate}</td><td>{row.supplier}</td><td className={base.code}>{row.itemCode}</td><td>{row.category || "—"}</td><td>{warehouseLabel(row.warehouse)}</td><td>{tons(row.quantity)}{row.deliverySum > 0 && <small>已交 {tons(row.deliverySum)}</small>}</td><td>{money(row.unitPrice)}</td><td>{money(row.amount)}</td><td>{row.taxIncluded ? "是￥" : "不×"}</td><td>{row.deliveryInfo || "—"}</td><td>{row.arrivalDate || "—"}</td><td className={row.effectiveStatus === "finished" ? base.received : base.waiting}>{row.effectiveStatus === "finished" ? "已交货" : "未交货"}</td><td className={base.remark} title={row.remark}>{row.remark || "—"}</td><td><div className={base.rowActions}><button onClick={(e) => edit(row, e.currentTarget)}>编辑</button><button className={base.dangerText} onClick={(e) => { returnFocus.current = e.currentTarget; setConfirmation({ kind: "order", row }); }}>删除</button></div></td></tr>)}
        {!result.data.length && <tr><td colSpan={14} className={base.empty}>{pending ? "正在加载…" : "没有符合条件的订货记录，可重置筛选或新增订货。"}</td></tr>}
      </tbody></table></div>
      <footer className={base.pagination}><span aria-live="polite">共 {result.total} 条 · 第 {result.page} / {pages} 页</span><label>每页<select value={filter.pageSize} disabled={pending} onChange={(e) => load({ ...filterRef.current, page: 1, pageSize: Number(e.target.value) as PurchaseFilter["pageSize"] })}>{[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>条</label><button disabled={pending || result.page <= 1} onClick={() => load({ ...filterRef.current, page: result.page - 1 })}>上一页</button><button disabled={pending || result.page >= pages} onClick={() => load({ ...filterRef.current, page: result.page + 1 })}>下一页</button><form onSubmit={(e) => { e.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page > 0 && page <= pages) load({ ...filterRef.current, page }); }}><label>跳至<input aria-label="跳转页码" type="number" min={1} max={pages} value={jump} onChange={(e) => setJump(e.target.value)} /></label><button disabled={pending}>确定</button></form></footer>
    </section>
    <Dialog.Root open={!!form} onOpenChange={(open) => { if (!open && !busy) setForm(null); }}><Dialog.Portal><Dialog.Overlay className={base.overlay} /><Dialog.Content className={`${base.dialog} ${styles.editor}`} onCloseAutoFocus={restoreFocus} onInteractOutside={(e) => e.preventDefault()}><div className={base.dialogHeading}><div><Dialog.Title>{form?.id ? "编辑订货" : "新增订货"}</Dialog.Title><Dialog.Description>填写订货信息，保存后可登记分批发货。</Dialog.Description></div><Dialog.Close className={base.iconButton} disabled={busy} aria-label="关闭订货编辑"><X /></Dialog.Close></div>
      {form && <form onSubmit={save}><fieldset className={base.fields} disabled={busy}>
        <label>订货日期 *<DatePicker id="purchase-edit-date" label="订货日期" value={form.orderDate} disabled={busy} onValueChange={(v) => change("orderDate", v)} /></label>
        <label>入库仓库<select value={form.warehouse} disabled={warehouseLocked} onChange={(e) => change("warehouse", e.target.value as Warehouse)}>{warehouseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><small>{warehouseLocked ? "已有入库记录，仓库不可修改。" : "整单和分批到货均计入所选仓库。"}</small></label>
        <label>配送日期/方式<input value={form.deliveryInfo} maxLength={255} onChange={(e) => change("deliveryInfo", e.target.value)} placeholder="配送日期或方式" /></label>
        <div className={base.field}><span>供货方 *</span><SearchCombobox required label="供货方" maxLength={255} placeholder="输入供货方/编号搜索" value={form.supplier} onValueChange={(v) => change("supplier", v)} options={supplierOptions} disabled={busy} /></div>
        <label>到货日期<DatePicker id="purchase-edit-arrival" label="到货日期" value={form.arrivalDate} disabled={busy} onValueChange={(v) => change("arrivalDate", v)} /></label>
        <div className={base.field}><span>货号 *</span><MaterialCodeCombobox value={form.itemCode} onValueChange={(v) => change("itemCode", v)} options={options.materials} label="订货货号" disabled={busy} maxLength={100} /></div>
        <label>是否已交货<select value={form.status} onChange={(e) => change("status", e.target.value as PurchaseInput["status"])}><option value="unfinished">未交货</option><option value="finished">已交货</option></select></label>
        <div className={base.field}><span>类别</span><SearchCombobox label="类别" maxLength={100} value={form.category} onValueChange={(v) => change("category", v)} placeholder="选择或输入类别" options={categoryOptions} disabled={busy} /></div>
        <label>备注<textarea maxLength={10000} rows={3} value={form.remark} onChange={(e) => change("remark", e.target.value)} /></label>
        <label>数量（吨）<input type="number" min={0} max={999999999.999} step="0.001" value={form.quantity} onChange={(e) => change("quantity", Number(e.target.value))} /></label>
        <label>单价（元/吨）<input type="number" min={0} step="0.01" value={form.unitPrice} onChange={(e) => change("unitPrice", Number(e.target.value))} /></label>
        <label>金额<output>{money(form.quantity * form.unitPrice)}</output></label>
        <label>是否￥<select value={String(form.taxIncluded)} onChange={(e) => { const taxIncluded = e.target.value === "true"; setForm({ ...form, taxIncluded, ...(taxIncluded ? {} : { remittanceInCompany: "", remittanceOutCompany: "", remittanceDate: "" }) }); }}><option value="false">不×（不含×）</option><option value="true">是￥（含×）</option></select></label>
        {form.taxIncluded && <><label>汇入公司<input maxLength={255} value={form.remittanceInCompany} onChange={(e) => change("remittanceInCompany", e.target.value)} /></label><label>汇出公司<input maxLength={255} value={form.remittanceOutCompany} onChange={(e) => change("remittanceOutCompany", e.target.value)} /></label><label>汇款日期<DatePicker id="purchase-remittance" label="汇款日期" value={form.remittanceDate} disabled={busy} onValueChange={(v) => change("remittanceDate", v)} /></label></>}
        {form.id && <div className={`${base.fullWidth} ${base.history}`}><div className={base.historyHeading}><h3>分批发货</h3><span className={styles.summary}>已交 {tons(dueSum)} / 订货 {tons(form.quantity)} 吨</span></div><p>已登记 {tons(registered)} 吨（含待到货批次）。分批添加和删除会立即保存，入库仓库：{warehouseLabel(savedWarehouse)}。</p>
          <div className={styles.batchScroll}><table className={styles.batchTable}><thead><tr><th>到货日期</th><th>本次数量（吨）</th><th>状态</th><th>操作</th></tr></thead><tbody>{deliveries.map((d) => <tr key={d.id}><td>{d.deliveryDate}</td><td>{tons(d.quantity)}</td><td>{d.deliveryDate > today ? "待到货" : "已到货"}</td><td><button className={base.dangerText} type="button" disabled={busy} onClick={() => setConfirmation({ kind: "delivery", row: d })}>删除</button></td></tr>)}{!deliveries.length && <tr><td colSpan={4}>尚无分批发货记录</td></tr>}</tbody></table></div>
          <div className={styles.addBatch}><div className={base.field}><span>本次到货日期</span><DatePicker id="purchase-batch-date" label="本次到货日期" value={newDelivery.date} disabled={busy} onValueChange={(date) => setNewDelivery({ ...newDelivery, date })} /></div><label>本次数量（吨）<input type="number" min="0.001" step="0.001" value={newDelivery.quantity} onChange={(e) => setNewDelivery({ ...newDelivery, quantity: e.target.value })} /></label><button className={base.secondary} type="button" disabled={busy} onClick={addBatch}><Plus />添加</button></div>
        </div>}
      </fieldset>{formError && <p className={base.error} role="alert">{formError}</p>}<div className={base.dialogFooter}><Dialog.Close asChild><button type="button" className={base.secondary} disabled={busy}>取消</button></Dialog.Close><button className={base.primary} disabled={busy}>{busy ? "处理中…" : "保存"}</button></div></form>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <AlertDialog.Root open={!!confirmation} onOpenChange={(open) => { if (!open && !busy) setConfirmation(null); }}><AlertDialog.Portal><AlertDialog.Overlay className={`${base.overlay} ${styles.confirmOverlay}`} /><AlertDialog.Content className={`${base.confirmDialog} ${styles.confirm}`} onCloseAutoFocus={confirmation?.kind === "order" ? restoreFocus : undefined}><AlertDialog.Title>{confirmation?.kind === "delivery" ? "删除到货记录" : "删除订货记录"}</AlertDialog.Title><AlertDialog.Description>{confirmation?.kind === "delivery" ? `确定删除 ${confirmation.row.deliveryDate} 的 ${tons(confirmation.row.quantity)} 吨到货记录？对应入库记录和库存会一并冲减。` : `确定删除订货记录（货号：${confirmation?.row.itemCode}）？已入库的货物保留在库存中。`}</AlertDialog.Description><div className={base.dialogFooter}><AlertDialog.Cancel asChild><button className={base.secondary} disabled={busy}>取消</button></AlertDialog.Cancel><button className={base.danger} disabled={busy} onClick={confirmDelete}>{busy ? "删除中…" : "确定删除"}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
