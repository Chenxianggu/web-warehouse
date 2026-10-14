"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertDialog, Dialog } from "radix-ui";
import { ClipboardList, Plus, Save, Trash2, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DatePicker } from "@/components/date-picker";
import { lineSubtotal, type OrderOptions, type OrderRecord } from "@/features/customer-orders/schema";
import { deleteCustomerOrder, getCustomerOrder, listCustomerOrders, listOrderReceivers, saveCustomerOrder } from "./actions";
import { OrderCombobox } from "./order-combobox";
import styles from "./orders.module.css";

type DraftItem = { key: number; code: string; name: string; packCount: string; unitPrice: string; packsPerTon: number; remark: string };
type Draft = { id: number | null; orderNo: string; orderDate: string; customerCode: string; customerName: string; receiver: string; deductFutures: boolean; items: DraftItem[] };
const blankItem = (key: number): DraftItem => ({ key, code: "", name: "", packCount: "", unitPrice: "", packsPerTon: 40, remark: "" });
const blankForm = (date: string, key: number): Draft => ({ id: null, orderNo: "", orderDate: date, customerCode: "", customerName: "", receiver: "", deductFutures: false, items: [blankItem(key)] });
const money = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function OrdersWorkbench({ initialOrders, options, today }: { initialOrders: OrderRecord[]; options: OrderOptions; today: string }) {
  const nextKey = useRef(1);
  const lastRowButton = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState(() => blankForm(today, 0));
  const [listDate, setListDate] = useState(today);
  const [orders, setOrders] = useState(initialOrders);
  const [listError, setListError] = useState(false);
  const [receivers, setReceivers] = useState<{ customerCode: string; values: string[] }>({ customerCode: "", values: [] });
  const [receiverVersion, setReceiverVersion] = useState(0);
  const [detail, setDetail] = useState<OrderRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrderRecord | null>(null);
  const [pending, startTransition] = useTransition();
  const receiverOptions = useMemo(() => (receivers.customerCode === form.customerCode ? receivers.values : []).map((receiver) => ({ code: receiver, name: "" })), [receivers, form.customerCode]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      listOrderReceivers(form.customerCode).then((values) => { if (!cancelled) setReceivers({ customerCode: form.customerCode, values }); }).catch(() => {
        if (!cancelled) { setReceivers({ customerCode: form.customerCode, values: [] }); toast.error("收货单位历史加载失败，可手动输入"); }
      });
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.customerCode, receiverVersion]);

  function reset() { setForm(blankForm(listDate, nextKey.current++)); }
  function updateItem(key: number, changes: Partial<DraftItem>) {
    setForm((current) => ({ ...current, items: current.items.map((item) => item.key === key ? { ...item, ...changes } : item) }));
  }
  async function refresh(date: string) {
    try { setOrders(await listCustomerOrders(date)); setListError(false); }
    catch { setListError(true); toast.error("订单列表加载失败，请重试"); }
  }
  function changeDate(date: string) {
    setListDate(date);
    startTransition(async () => { await refresh(date); });
  }
  function openOrder(row: OrderRecord, button: HTMLButtonElement) {
    lastRowButton.current = button;
    startTransition(async () => {
      try {
        const order = await getCustomerOrder(row.id);
        if (!order) { toast.error("订单不存在或已被删除"); await refresh(listDate); return; }
        if (order.isShipped) { setDetail(order); return; }
        setForm({ ...order, items: order.items.length ? order.items.map((item) => ({ ...item, key: nextKey.current++, packCount: String(item.packCount), unitPrice: String(item.unitPrice) })) : [blankItem(nextKey.current++)] });
        toast.success("订单已加载到表单，可以编辑");
      } catch { toast.error("加载订单失败，请重试"); }
    });
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.orderDate) { toast.error("请选择订单日期"); return; }
    startTransition(async () => {
      try {
        const result = await saveCustomerOrder({ ...form, items: form.items.map((item) => ({ ...item, packCount: Number(item.packCount), unitPrice: Number(item.unitPrice) })) });
        if (!result.ok) { toast.error(result.message); return; }
        toast.success(form.id ? "订单已更新" : "订单已保存", { description: `订单号 ${result.orderNo}` });
        reset(); setReceiverVersion((current) => current + 1); await refresh(listDate);
      } catch { toast.error("保存失败，请检查连接后重试"); }
    });
  }
  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      try {
        const result = await deleteCustomerOrder(target.id);
        if (!result.ok) { toast.error(result.message); setDeleteTarget(null); await refresh(listDate); return; }
        if (form.id === target.id) reset();
        setDeleteTarget(null); toast.success("订单已删除"); await refresh(listDate);
      } catch { toast.error("删除失败，请重试"); }
    });
  }

  return <div className={styles.page}>
    <header className={styles.hero}><div><h1>客户订单</h1><p>录入订单与塑料明细，按日期跟进出库状态。</p></div><ClipboardList aria-hidden="true" /></header>
    <div className={styles.workspace}>
      <section className={styles.panel} aria-labelledby="orders-list-title" aria-busy={pending}>
        <header className={styles.panelHeader}><div><h2 id="orders-list-title">{listDate ? "当天订单" : "全部订单"}</h2><p>{listError ? "加载失败，请重试" : `${orders.length} 笔订单 · 点击查看或编辑`}</p></div>
          <DatePicker id="orders-list-date" label="订单列表日期" value={listDate} onValueChange={changeDate} disabled={pending} />
        </header>
        {listError ? <div className={styles.empty}><p>订单列表加载失败</p><button className={styles.secondaryButton} disabled={pending} onClick={() => startTransition(async () => { await refresh(listDate); })}>重新加载</button></div> :
        <div className={styles.listScroll}><table className={styles.orderTable}><thead><tr><th>订单号</th><th>客户编号</th><th>客户姓名</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{orders.map((order) => <tr key={order.id} data-selected={form.id === order.id || undefined}
            onClick={(event) => { if (pending || (event.target as HTMLElement).closest("button")) return; const button = event.currentTarget.querySelector("button"); if (button) openOrder(order, button); }}>
            <td><button type="button" className={styles.orderLink} disabled={pending} onClick={(event) => openOrder(order, event.currentTarget)} aria-label={`${order.isShipped ? "查看" : "编辑"}订单 ${order.orderNo}`}>{order.orderNo}</button></td>
            <td className={styles.code}>{order.customerCode}</td><td>{order.customerName}</td><td><span className={styles.status} data-shipped={order.isShipped}>{order.isShipped ? "已出库" : "未出库"}</span></td>
            <td>{order.isShipped ? <span className={styles.muted}>—</span> : <button type="button" className={styles.deleteButton} disabled={pending} aria-label={`删除订单 ${order.orderNo}`} onClick={() => setDeleteTarget(order)}><Trash2 aria-hidden="true" /><span>删除</span></button>}</td>
          </tr>)}</tbody></table>
          {!orders.length && <div className={styles.empty}><ClipboardList aria-hidden="true" /><strong>暂无订单</strong><p>在右侧录入并保存客户订单。</p></div>}
        </div>}
      </section>

      <section className={`${styles.panel} ${styles.editor}`} aria-labelledby="order-form-title">
        <form onSubmit={submit}><header className={styles.panelHeader}><div><h2 id="order-form-title">{form.id ? "编辑订单" : "新建订单"}</h2><p>{form.id ? form.orderNo : "保存后自动生成订单号"}</p></div>
          <div className={styles.actions}>{form.id !== null && <button className={styles.secondaryButton} type="button" disabled={pending} onClick={() => { reset(); toast.info("已切换到新建订单模式"); }}><RotateCcw aria-hidden="true" />新建订单</button>}
          <button type="submit" className={styles.primaryButton} disabled={pending}><Save aria-hidden="true" />{pending ? "处理中…" : form.id ? "更新订单" : "保存订单"}</button></div>
        </header>
        <fieldset disabled={pending} className={styles.formBody}>
          <div className={styles.fields}>
            <div className={styles.customerFields}>
              <div className={styles.field}><label htmlFor="order-customer-code">客户编号 <span>*</span></label><OrderCombobox id="order-customer-code" label="客户编号" value={form.customerCode} options={options.customers} placeholder="输入编号、姓名或拼音"
                onChange={(customerCode) => setForm((current) => ({ ...current, customerCode }))}
                onSelect={(customer) => setForm((current) => ({ ...current, customerCode: customer.code, customerName: customer.name }))} /></div>
              <div className={styles.field}><label htmlFor="order-customer-name">客户名称 <span>*</span></label><input id="order-customer-name" required maxLength={255} value={form.customerName} placeholder="自动带出或手填" onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))} /></div>
            </div>
            <div className={styles.field}><label htmlFor="order-date">订单日期 <span>*</span></label><DatePicker id="order-date" label="订单日期" value={form.orderDate} onValueChange={(orderDate) => setForm((current) => ({ ...current, orderDate }))} disabled={pending} /></div>
            <div className={styles.field}><label htmlFor="order-receiver">收货单位 <span>*</span></label><div className={styles.receiverRow}><OrderCombobox id="order-receiver" label="收货单位" value={form.receiver} options={receiverOptions} showEmpty maxLength={255} placeholder="选择或输入收货单位"
              onChange={(receiver) => setForm((current) => ({ ...current, receiver }))} onSelect={({ code }) => setForm((current) => ({ ...current, receiver: code }))} />
              <label className={styles.checkbox}><input type="checkbox" checked={form.receiver === "自提"} onChange={(event) => setForm((current) => ({ ...current, receiver: event.target.checked ? "自提" : "" }))} />自提</label></div></div>
          </div>
          <label className={styles.checkbox}><input type="checkbox" checked={form.deductFutures} onChange={(event) => setForm((current) => ({ ...current, deductFutures: event.target.checked }))} />是否扣寄仓数量</label>
          <div className={styles.itemsHeader}><h3>订单明细</h3><button type="button" className={styles.secondaryButton} onClick={() => { const item = blankItem(nextKey.current++); setForm((current) => ({ ...current, items: [...current.items, item] })); }}><Plus aria-hidden="true" />添加塑料</button></div>
          <div className={styles.items}>
            <div className={styles.itemLabels} aria-hidden="true"><span>塑料编号</span><span>塑料名称</span><span>包数</span><span>单价</span><span>备注</span><span /></div>
            {form.items.map((item, index) => <div className={styles.item} key={item.key}>
              <div className={styles.itemField} data-label="塑料编号"><OrderCombobox label={`第${index + 1}行塑料编号`} value={item.code} options={options.materials} placeholder="编号或拼音"
                onChange={(code) => updateItem(item.key, { code })} onSelect={(material) => updateItem(item.key, { code: material.code, name: material.name, packsPerTon: options.materials.find((value) => value.code === material.code)?.packsPerTon || 40 })} /></div>
              <div className={styles.itemField} data-label="塑料名称"><input aria-label={`第${index + 1}行塑料名称`} value={item.name} maxLength={255} required placeholder="自动带出或手填" onChange={(event) => updateItem(item.key, { name: event.target.value })} /></div>
              <div className={styles.itemField} data-label="包数"><input id={`packs-${item.key}`} type="number" inputMode="numeric" aria-label={`第${index + 1}行包数`} required min={1} max={9999999999} step={1} value={item.packCount} onChange={(event) => updateItem(item.key, { packCount: event.target.value })} placeholder="包数" /></div>
              <div className={styles.itemField} data-label="单价"><input id={`price-${item.key}`} type="number" inputMode="decimal" aria-label={`第${index + 1}行单价`} min={0} max={9999999999.99} step={0.01} value={item.unitPrice} onChange={(event) => updateItem(item.key, { unitPrice: event.target.value })} placeholder="单价" /></div>
              <div className={styles.itemField} data-label="备注"><input aria-label={`第${index + 1}行备注`} maxLength={500} value={item.remark} placeholder="选填" onChange={(event) => updateItem(item.key, { remark: event.target.value })} /></div>
              <button type="button" className={styles.deleteButton} aria-label={`删除第${index + 1}行明细`} onClick={() => {
                if (form.items.length === 1) { toast.warning("至少保留一行明细"); return; }
                setForm((current) => ({ ...current, items: current.items.filter((row) => row.key !== item.key) }));
              }}><Trash2 aria-hidden="true" /><span>删除</span></button>
            </div>)}
          </div>
        </fieldset></form>
      </section>
    </div>

    <AlertDialog.Root open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !pending) setDeleteTarget(null); }}>
      <AlertDialog.Portal><AlertDialog.Overlay className={styles.backdrop} /><AlertDialog.Content className={`${styles.dialog} ${styles.confirm}`}>
        <AlertDialog.Title className={styles.dialogTitle}>删除订单</AlertDialog.Title>
        <AlertDialog.Description className={styles.dialogDescription}>确定要删除订单 {deleteTarget?.orderNo}（{deleteTarget?.customerName}）吗？删除后无法恢复。</AlertDialog.Description>
        <footer className={styles.dialogFooter}><AlertDialog.Cancel asChild><button className={styles.secondaryButton} disabled={pending}>取消</button></AlertDialog.Cancel><button className={styles.deleteButton} disabled={pending} onClick={confirmDelete}>{pending ? "删除中…" : "确定删除"}</button></footer>
      </AlertDialog.Content></AlertDialog.Portal>
    </AlertDialog.Root>
    <Dialog.Root open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null); }}>
      <Dialog.Portal><Dialog.Overlay className={styles.backdrop} /><Dialog.Content className={styles.dialog} onCloseAutoFocus={(event) => { event.preventDefault(); lastRowButton.current?.focus(); }}>
        <header className={styles.detailHeader}><div><Dialog.Title className={styles.dialogTitle}>订单详情</Dialog.Title><Dialog.Description className={styles.dialogDescription}>已出库的订单仅供查看。</Dialog.Description></div><Dialog.Close asChild><button className={styles.iconButton} aria-label="关闭订单详情"><X aria-hidden="true" /></button></Dialog.Close></header>
        {detail && <><dl className={styles.descriptions}><div><dt>订单号</dt><dd className={styles.code}>{detail.orderNo}</dd></div><div><dt>订单日期</dt><dd>{detail.orderDate}</dd></div><div><dt>客户编号</dt><dd>{detail.customerCode}</dd></div><div><dt>客户姓名</dt><dd>{detail.customerName}</dd></div><div><dt>收货单位</dt><dd>{detail.receiver}</dd></div><div><dt>创建时间</dt><dd>{new Date(detail.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</dd></div></dl>
          <h3 className={styles.detailSubtitle}>订单明细</h3><div className={styles.detailScroll}><table className={styles.detailTable}><thead><tr><th>塑料编号</th><th>塑料名称</th><th>包数</th><th>单价</th><th>备注</th><th>小计</th></tr></thead><tbody>{detail.items.map((item, index) => <tr key={index}><td className={styles.code}>{item.code}</td><td>{item.name}</td><td>{item.packCount}</td><td>{money(item.unitPrice)}</td><td>{item.remark || "—"}</td><td>{money(lineSubtotal(item))}</td></tr>)}</tbody></table></div>
          <p className={styles.total}>合计：<strong>{money(detail.items.reduce((sum, item) => sum + lineSubtotal(item), 0))}</strong></p>
        </>}
        <footer className={styles.dialogFooter}><Dialog.Close asChild><button className={styles.primaryButton}>关闭</button></Dialog.Close></footer>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </div>;
}
