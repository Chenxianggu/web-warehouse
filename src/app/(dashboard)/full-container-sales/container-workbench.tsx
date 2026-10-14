"use client";
import { useRef, useState, useTransition } from "react";
import { Dialog, AlertDialog } from "radix-ui";
import { Container, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { DatePicker, DateRangePicker } from "@/components/date-picker";
import { clearSupply, emptyContainerFilter, type ContainerFilter, type ContainerInput, type ContainerPage, type ContainerRecord } from "@/features/full-containers/schema";
import { containerOptions, listFullContainers, saveFullContainer, deleteFullContainer } from "./actions";
import base from "../consignments/consignments.module.css";
import styles from "./container.module.css";

type Options = Awaited<ReturnType<typeof containerOptions>>;
type FieldKey = Exclude<keyof ContainerInput, "id" | "updatedAt">;
type Field = { key: FieldKey; label: string; kind: "text" | "number" | "date" | "boolean" | "textarea"; list?: string; step?: string };
const saleFields: Field[] = [
  { key: "orderDate", label: "销售订货日期 *", kind: "date" }, { key: "buyer", label: "需方", kind: "text", list: "container-buyers" },
  { key: "itemName", label: "货物名称", kind: "text", list: "container-materials" }, { key: "quantity", label: "数量（吨）", kind: "number", step: "0.001" },
  { key: "unitPrice", label: "销售单价（元/吨）", kind: "number", step: "0.01" }, { key: "taxIncluded", label: "销售￥", kind: "boolean" },
  { key: "deliveryInfo", label: "配送日期", kind: "text" }, { key: "warehouseOnArrival", label: "期到是否寄仓", kind: "boolean" }, { key: "remark", label: "销售备注", kind: "textarea" },
];
const supplyFields: Field[] = [
  { key: "supplier", label: "供方", kind: "text", list: "container-suppliers" }, { key: "supplyOrderDate", label: "供货订货日期", kind: "date" },
  { key: "supplyUnitPrice", label: "供货单价（元/吨）", kind: "number", step: "0.01" }, { key: "supplyTaxIncluded", label: "供货￥", kind: "boolean" },
  { key: "followStatus", label: "跟进状态", kind: "text" }, { key: "delivered", label: "是否已交货", kind: "boolean" }, { key: "deliveryDate", label: "交货日期", kind: "date" }, { key: "supplyRemark", label: "供货备注", kind: "textarea" },
];
const saleColumns = ["订货日期", "需方", "货物名称", "数量(吨)", "单价", "金额", "配送日期", "期到是否寄仓", "备注"];
const supplyColumns = ["供方", "订货日期", "货物名称", "数量(吨)", "单价", "金额", "跟进状态", "是否已交货", "交货日期", "备注"];
const money = (n: number) => `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tons = (n: number) => n.toLocaleString("zh-CN", { maximumFractionDigits: 3 });
function blank(today: string): ContainerInput { return { id: null, updatedAt: null, orderDate: today, buyer: "", itemName: "", quantity: 0, unitPrice: 0, taxIncluded: false, deliveryInfo: "", warehouseOnArrival: false, remark: "", supplier: "", supplyOrderDate: "", supplyUnitPrice: 0, supplyTaxIncluded: false, followStatus: "", delivered: false, deliveryDate: "", supplyRemark: "" }; }

export function ContainerWorkbench({ initial, options, today }: { initial: ContainerPage; options: Options; today: string }) {
  const [result, setResult] = useState(initial); const [draft, setDraft] = useState(emptyContainerFilter); const [filter, setFilter] = useState(emptyContainerFilter);
  const filterRef = useRef(filter); const requestId = useRef(0); const [pending, startTransition] = useTransition(); const [error, setError] = useState("");
  const [form, setForm] = useState<ContainerInput | null>(null); const [formError, setFormError] = useState(""); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ContainerRecord | null>(null); const [suppliers, setSuppliers] = useState(options.suppliers); const [jump, setJump] = useState("1");
  const addButton = useRef<HTMLButtonElement | null>(null); const returnFocus = useRef<HTMLButtonElement | null>(null);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  function load(next: ContainerFilter) {
    const request = ++requestId.current; filterRef.current = next; setFilter(next);
    startTransition(async () => { try { const page = await listFullContainers(next); if (request !== requestId.current) return; setResult(page); setError(""); setJump(String(page.page)); } catch { if (request === requestId.current) setError("加载整柜货记录失败，请重试"); } });
  }
  function edit(row: ContainerRecord | null, trigger: HTMLButtonElement) { returnFocus.current = trigger; setForm(row ? { ...row } : blank(today)); setFormError(""); }
  function change(key: FieldKey, value: string | number | boolean) {
    setForm((current) => { if (!current) return current; const next = { ...current, [key]: value }; return key === "warehouseOnArrival" && value === true ? clearSupply(next) : next; });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form || busy) return; setBusy(true); setFormError("");
    try { const saved = await saveFullContainer(form); if (!saved.ok) { setFormError(saved.message); return; } toast.success(saved.message); setForm(null); const refreshed = await containerOptions().catch(() => null); if (refreshed) setSuppliers(refreshed.suppliers); load({ ...filterRef.current, page: form.id ? filterRef.current.page : 1 }); } catch { setFormError("保存失败，请重试"); } finally { setBusy(false); }
  }
  async function remove() {
    if (!deleting || busy) return; setBusy(true);
    try { const deleted = await deleteFullContainer(deleting.id, deleting.updatedAt); if (!deleted.ok) { toast.error(deleted.message); load(filterRef.current); return; } toast.success("删除成功"); setDeleting(null); load({ ...filterRef.current, page: 1 }); const refreshed = await containerOptions().catch(() => null); if (refreshed) setSuppliers(refreshed.suppliers); } catch { toast.error("删除失败，请重试"); } finally { setBusy(false); }
  }
  function restoreFocus(e: Event) { e.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : addButton.current)?.focus(); }
  function renderField(field: Field, disabled = false) {
    if (!form) return null;
    const { key, label, kind } = field; const id = `container-${key}`;
    return <label key={key} className={kind === "textarea" ? base.fullWidth : undefined}>{label}
      {kind === "date" ? <DatePicker id={id} label={label.replace(" *", "")} value={String(form[key])} disabled={busy || disabled} onValueChange={(v) => change(key, v)} /> : kind === "boolean" ? <select value={String(form[key])} onChange={(e) => change(key, e.target.value === "true")}><option value="false">{key.includes("Tax") || key === "taxIncluded" ? "不×（不含×）" : "否"}</option><option value="true">{key.includes("Tax") || key === "taxIncluded" ? "是￥（含×）" : key === "warehouseOnArrival" ? "是（寄仓）" : "是（已交货）"}</option></select> : kind === "textarea" ? <textarea rows={2} maxLength={10000} value={String(form[key])} onChange={(e) => change(key, e.target.value)} /> : <input type={kind === "number" ? "number" : "text"} min={kind === "number" ? 0 : undefined} step={field.step} list={field.list} maxLength={key === "itemName" ? 100 : 255} value={String(form[key])} placeholder={field.list ? "选择或输入" : undefined} onChange={(e) => change(key, kind === "number" ? Number(e.target.value) : e.target.value)} />}
    </label>;
  }
  return <div className={`${base.page} ${styles.page}`}>
    <header className={base.hero}><div><h1>售整柜货</h1><p>管理整柜销售与供应商供货，跟进寄仓及交货状态。</p></div><Container aria-hidden="true" /></header>
    <section className={base.panel} aria-label="整柜货记录"><div className={base.panelHeader}><div><h2>销售与供货记录</h2><p>同一行对应一笔销售及其供应商供货。</p></div><button ref={addButton} className={base.primary} onClick={(e) => edit(null, e.currentTarget)}><Plus />新增</button></div>
      <form className={`${base.filters} ${styles.filters}`} onSubmit={(e) => { e.preventDefault(); load({ ...draft, page: 1, pageSize: filter.pageSize }); }}><label className={styles.dateRange}>订货日期范围<DateRangePicker id="container-date-range" label="订货日期范围" value={{ start: draft.startDate, end: draft.endDate }} onValueChange={(v) => setDraft({ ...draft, startDate: v.start, endDate: v.end })} /></label>{(["buyer", "supplier", "itemName"] as const).map((key, i) => <label key={key}>{["需方", "供方", "货物名称"][i]}<input value={draft[key]} maxLength={key === "itemName" ? 100 : 255} placeholder={`输入${["需方", "供方", "货物名称"][i]}`} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></label>)}<button className={base.primary} disabled={pending}><Search />查询</button><button type="button" className={base.secondary} disabled={pending} onClick={() => { setDraft(emptyContainerFilter); load({ ...emptyContainerFilter, pageSize: filter.pageSize }); }}>重置</button></form>
      {error && <p className={base.error} role="alert">{error}<button onClick={() => load(filterRef.current)}>重试</button></p>}
      <div className={base.tableScroll} tabIndex={0} aria-label="销售与供货对照表，可横向滚动" aria-busy={pending}><table className={`${base.table} ${styles.table}`}><thead><tr><th colSpan={9} scope="colgroup"><span className={styles.groupName}>我的销售订单</span></th><th colSpan={10} scope="colgroup"><span className={styles.groupName}>供应商供货</span></th><th rowSpan={2} scope="col">操作</th></tr><tr>{[...saleColumns, ...supplyColumns].map((label, i) => <th key={i} scope="col">{label}</th>)}</tr></thead><tbody>{result.data.map((row) => {
        const cells = [row.orderDate, row.buyer, row.itemName, tons(row.quantity), money(row.unitPrice) + (row.taxIncluded ? "（含）" : ""), money(row.amount), row.deliveryInfo, row.warehouseOnArrival ? "是（寄仓）" : "否", row.remark, row.supplier, row.supplyOrderDate, row.itemName, tons(row.quantity), money(row.supplyUnitPrice) + (row.supplyTaxIncluded ? "（含）" : ""), money(row.supplyAmount), row.followStatus, row.delivered ? "是（已交货）" : "否（未交货）", row.deliveryDate, row.supplyRemark];
        return <tr key={row.id}>{cells.map((v, i) => <td key={i} title={v}>{v || "—"}</td>)}<td><div className={base.rowActions}><button onClick={(e) => edit(row, e.currentTarget)}>编辑</button><button className={base.dangerText} onClick={(e) => { returnFocus.current = e.currentTarget; setDeleting(row); }}>删除</button></div></td></tr>;
      })}{!result.data.length && <tr><td colSpan={20} className={base.empty}>{pending ? "正在加载…" : "没有符合条件的整柜货记录，可重置筛选或新增记录。"}</td></tr>}</tbody></table></div>
      <footer className={base.pagination}><span aria-live="polite">共 {result.total} 条 · 第 {result.page} / {pages} 页</span><label>每页<select value={filter.pageSize} disabled={pending} onChange={(e) => load({ ...filterRef.current, page: 1, pageSize: Number(e.target.value) as ContainerFilter["pageSize"] })}>{[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>条</label><button disabled={pending || result.page <= 1} onClick={() => load({ ...filterRef.current, page: result.page - 1 })}>上一页</button><button disabled={pending || result.page >= pages} onClick={() => load({ ...filterRef.current, page: result.page + 1 })}>下一页</button><form onSubmit={(e) => { e.preventDefault(); const page = Number(jump); if (Number.isInteger(page) && page > 0 && page <= pages) load({ ...filterRef.current, page }); }}><label>跳至<input aria-label="跳转页码" type="number" min={1} max={pages} value={jump} onChange={(e) => setJump(e.target.value)} /></label><button disabled={pending}>确定</button></form></footer>
    </section>
    <Dialog.Root open={!!form} onOpenChange={(open) => { if (!open && !busy) setForm(null); }}><Dialog.Portal><Dialog.Overlay className={base.overlay} /><Dialog.Content className={`${base.dialog} ${styles.editor}`} onCloseAutoFocus={restoreFocus} onInteractOutside={(e) => e.preventDefault()}><div className={base.dialogHeading}><div><Dialog.Title>{form?.id ? "编辑整柜货" : "新增整柜货"}</Dialog.Title><Dialog.Description>填写销售和供货信息，寄仓货物会同步到客户寄存。</Dialog.Description></div><Dialog.Close className={base.iconButton} disabled={busy} aria-label="关闭整柜货编辑"><X /></Dialog.Close></div>
      {form && <form onSubmit={save}><fieldset disabled={busy} className={`${base.fields} ${styles.fields}`}><legend>销售信息</legend>{saleFields.map((f) => renderField(f))}<label>销售金额<output>{money(form.quantity * form.unitPrice)}</output></label></fieldset><fieldset disabled={busy || form.warehouseOnArrival} className={`${base.fields} ${styles.fields}`}><legend>供货信息 {form.warehouseOnArrival && <small>期到寄仓时无需填写</small>}</legend>{supplyFields.map((f) => renderField(f, form.warehouseOnArrival))}<label>供货金额<output>{money(form.quantity * form.supplyUnitPrice)}</output></label></fieldset><datalist id="container-buyers">{options.customers.map((c) => <option key={c.code} value={c.name}>{c.code} · {c.name}</option>)}</datalist><datalist id="container-materials">{options.materials.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</datalist><datalist id="container-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>{formError && <p className={base.error} role="alert">{formError}</p>}<div className={base.dialogFooter}><Dialog.Close asChild><button className={base.secondary} disabled={busy} type="button">取消</button></Dialog.Close><button className={base.primary} disabled={busy}>{busy ? "保存中…" : "保存"}</button></div></form>}
    </Dialog.Content></Dialog.Portal></Dialog.Root>
    <AlertDialog.Root open={!!deleting} onOpenChange={(open) => { if (!open && !busy) setDeleting(null); }}><AlertDialog.Portal><AlertDialog.Overlay className={base.overlay} /><AlertDialog.Content className={base.confirmDialog} onCloseAutoFocus={restoreFocus}><AlertDialog.Title>删除整柜货记录</AlertDialog.Title><AlertDialog.Description>确定删除该记录（需方：{deleting?.buyer || "—"} / 供方：{deleting?.supplier || "—"}）？相关客户寄存会删除，已入库货物保留在库存中。</AlertDialog.Description><div className={base.dialogFooter}><AlertDialog.Cancel asChild><button className={base.secondary} disabled={busy}>取消</button></AlertDialog.Cancel><button className={base.danger} disabled={busy} onClick={remove}>{busy ? "删除中…" : "确定删除"}</button></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
