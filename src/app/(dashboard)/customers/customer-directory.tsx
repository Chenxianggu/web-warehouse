"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { ContactRound, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCustomer, deleteCustomer, deleteReceiver, listCustomers, listReceivers, saveReceiver, updateCustomer } from "./actions";
import styles from "./customers.module.css";

type Customer = { id: number; code: string; fullName: string; createdAt: Date };
type Receiver = { id: number; receiver: string };
type DeleteTarget = { kind: "customer"; id: number; label: string } | { kind: "receiver"; id: number; label: string };

export function CustomerDirectory({ initialData }: { initialData: { data: Customer[]; total: number; page: number; pageSize: number } }) {
  const [rows, setRows] = useState(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [receiverText, setReceiverText] = useState("");
  const [receiverId, setReceiverId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [pending, startTransition] = useTransition();
  const pages = Math.max(1, Math.ceil(total / initialData.pageSize));

  const showToast = useCallback((kind: "success" | "error", title: string, description: string) => {
    toast[kind](title, { description });
  }, []);

  const refresh = useCallback((nextPage = page, nextKeyword = search) => {
    startTransition(async () => {
      try {
        const result = await listCustomers(nextKeyword, nextPage, initialData.pageSize);
        setRows(result.data); setTotal(result.total); setPage(result.page);
      } catch {
        showToast("error", "客户列表加载失败", "请检查连接后重试");
      }
    });
  }, [initialData.pageSize, page, search, showToast]);

  // The debounce intentionally reacts only to the search field; paging changes must not reset the query.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(keyword.trim()); refresh(1, keyword.trim()); }, 260); return () => window.clearTimeout(timer); }, [keyword]);

  const openCreate = () => { setEditing(null); setReceivers([]); setModal("create"); };
  const openEdit = (row: Customer) => { setEditing(row); setModal("edit"); startTransition(async () => { try { setReceivers(await listReceivers(row.code)); } catch { showToast("error", "地址历史加载失败", "请稍后重试"); } }); };
  const close = () => { if (!pending) setModal(null); };

  const submitCustomer = (formData: FormData) => { startTransition(async () => { try { const result = editing ? await updateCustomer(formData) : await createCustomer(formData); if (!result.ok) { showToast("error", "客户保存失败", result.message || "请检查输入内容"); return; } setModal(null); showToast("success", editing ? "客户资料已更新" : "客户创建成功", editing ? "客户档案已保存" : "新的客户已加入目录"); refresh(); } catch { showToast("error", "客户保存失败", "服务暂时不可用，请重试"); } }); };
  const removeCustomer = (row: Customer) => setDeleteTarget({ kind: "customer", id: row.id, label: `客户“${row.fullName}”这条档案` });
  const submitReceiver = () => { if (!editing || !receiverText.trim()) { showToast("error", "地址保存失败", "请先填写收货地址"); return; } const fd = new FormData(); fd.set("customerCode", editing.code); fd.set("receiver", receiverText); if (receiverId) fd.set("id", String(receiverId)); startTransition(async () => { try { const result = await saveReceiver(fd); if (!result.ok) { showToast("error", "地址保存失败", result.message || "请检查输入内容"); return; } setReceiverText(""); setReceiverId(null); setReceivers(await listReceivers(editing.code)); showToast("success", receiverId ? "收货地址已更新" : "收货地址已添加", "地址历史已同步"); } catch { showToast("error", "地址保存失败", "服务暂时不可用，请重试"); } }); };
  const removeReceiver = (id: number) => setDeleteTarget({ kind: "receiver", id, label: "这条收货地址" });
  const confirmDelete = () => { if (!deleteTarget) return; const target = deleteTarget; setDeleteTarget(null); startTransition(async () => { try { if (target.kind === "customer") { await deleteCustomer(target.id); showToast("success", "客户已删除", "客户档案已移除"); refresh(rows.length === 1 && page > 1 ? page - 1 : page); } else { await deleteReceiver(target.id); if (editing) setReceivers(await listReceivers(editing.code)); showToast("success", "收货地址已删除", "地址历史已同步"); } } catch { showToast("error", target.kind === "customer" ? "客户删除失败" : "地址删除失败", "请稍后重试"); } }); };
  const canPrev = page > 1; const canNext = page < pages;

  return <div className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}><ContactRound aria-hidden="true" />客户主数据</p><h1>客户资料</h1><p>维护客户编号、姓名及常用收货地址，供订单业务直接调用。</p></div><div className={styles.heroActions}><span className={styles.liveBadge}><span />CUSTOMER NODE ONLINE</span><Button className={styles.primaryButton} onClick={openCreate}><Plus size={15} /> 新增客户</Button></div></header>
    <div className={styles.toolbar}><div style={{ position: "relative", flex: 1 }}><Search size={15} style={{ position: "absolute", zIndex: 1, left: 13, top: 14, color: "var(--rz-gold)" }} /><Input className={styles.search} style={{ paddingLeft: 37 }} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索客户编号或姓名" aria-label="搜索客户编号或姓名" /></div><span className={styles.count}>{pending ? "SYNCING..." : `${total} RECORDS`}</span></div>
    <section className={styles.directory} aria-labelledby="customer-directory-heading"><div className={styles.directoryHeader}><div><h2 id="customer-directory-heading">客户目录</h2><p>同编号客户共享收货地址与应收账款，可分别维护档案。</p></div><span className={styles.count}>PAGE {page} / {pages}</span></div><div className={styles.tableWrap}>{rows.length === 0 ? <div className={styles.empty}>暂无匹配客户记录。</div> : <table className={styles.table}><thead><tr><th>客户编号</th><th>客户姓名</th><th>建档时间</th><th style={{ textAlign: "right" }}>操作</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td className={styles.code}>{row.code}</td><td>{row.fullName}</td><td>{new Date(row.createdAt).toLocaleDateString("zh-CN")}</td><td><div className={styles.actions}><Button className={styles.secondaryButton} variant="outline" onClick={() => openEdit(row)}><Pencil size={13} /> 编辑</Button><Button className={styles.dangerButton} variant="outline" onClick={() => removeCustomer(row)}><Trash2 size={13} /> 删除</Button></div></td></tr>)}</tbody></table>}</div><div className={styles.pager}><span>共 {total} 条</span><Button variant="outline" size="icon-xs" onClick={() => refresh(page - 1)} disabled={!canPrev}>‹</Button><Button variant="outline" size="icon-xs" onClick={() => refresh(page + 1)} disabled={!canNext}>›</Button></div></section>
    <Dialog.Root open={Boolean(modal)} onOpenChange={(open) => !open && close()}><Dialog.Portal><Dialog.Overlay className={styles.dialogBackdrop} /><Dialog.Content className={styles.dialog} aria-describedby="customer-dialog-description"><div className={styles.dialogHeader}><div><Dialog.Title id="customer-dialog-title">{editing ? "编辑客户" : "新增客户"}</Dialog.Title><Dialog.Description id="customer-dialog-description" className={styles.dialogIntro}>{editing ? "更新基础资料，并维护该客户的收货地址历史。" : "录入客户编号与姓名，建立可追踪的客户档案。"}</Dialog.Description></div><Dialog.Close asChild><button className={styles.linkButton} aria-label="关闭"><X size={18} /></button></Dialog.Close></div><form className={styles.form} action={submitCustomer}><input type="hidden" name="id" value={editing?.id || ""} /><div className={styles.field}><label htmlFor="customer-code">客户编号</label><Input id="customer-code" name="code" defaultValue={editing?.code || ""} placeholder="例如：C001" required /></div><div className={styles.field}><label htmlFor="customer-name">客户姓名</label><Input id="customer-name" name="fullName" defaultValue={editing?.fullName || ""} placeholder="例如：王强" required /></div><div className={styles.dialogFooter}><Dialog.Close asChild><Button type="button" className={styles.secondaryButton} variant="outline">取消</Button></Dialog.Close><Button type="submit" className={styles.primaryButton} disabled={pending}>{pending ? "保存中…" : "保存客户"}</Button></div></form>{editing && <div className={styles.receiverSection}><div className={styles.receiverHeading}><span>收货地址历史</span><span>{receivers.length} 条</span></div><div className={styles.receiverEntry}><Input className={styles.receiverInput} value={receiverText} onChange={(e) => setReceiverText(e.target.value)} placeholder="例如：送汕头、自提、送本厂" /><Button type="button" className={styles.secondaryButton} variant="outline" onClick={submitReceiver} disabled={pending}>{receiverId ? "更新" : "添加"}</Button></div>{receivers.length ? <div className={styles.receiverList}>{receivers.map((item) => <div className={styles.receiverRow} key={item.id}><span>{item.receiver}</span><span className={styles.receiverActions}><button className={styles.linkButton} onClick={() => { setReceiverId(item.id); setReceiverText(item.receiver); }}>编辑</button><button className={styles.linkButton} data-danger onClick={() => removeReceiver(item.id)}>删除</button></span></div>)}</div> : <span className={styles.hint}>暂无收货地址，请在上方添加。</span>}</div>}</Dialog.Content></Dialog.Portal></Dialog.Root>
    <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}><AlertDialog.Portal><AlertDialog.Overlay className={styles.dialogBackdrop} /><AlertDialog.Content className={styles.confirmDialog}><AlertDialog.Title className={styles.confirmTitle}>确认删除记录？</AlertDialog.Title><AlertDialog.Description className={styles.confirmDescription}>确定删除{deleteTarget?.label}吗？此操作无法撤销。</AlertDialog.Description><div className={styles.dialogFooter}><AlertDialog.Cancel asChild><Button type="button" className={styles.secondaryButton} variant="outline">取消</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button type="button" className={styles.dangerButton} onClick={confirmDelete}>确认删除</Button></AlertDialog.Action></div></AlertDialog.Content></AlertDialog.Portal></AlertDialog.Root>
  </div>;
}
