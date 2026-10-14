"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Pencil, Plus, RefreshCw, Save, ShieldCheck, Table2, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import { MaterialCodeCombobox } from "@/components/material-code-combobox";
import { createClientId } from "@/lib/create-client-id";
import { loadPlasticPriceTable, loadPriceTableEditors, savePlasticPriceTable, savePriceTableEditors } from "@/app/(dashboard)/price-table-actions";
import { stockForCode, type PriceGroup, type PriceRow, type PriceStock, type PriceTableData } from "@/features/price-table/schema";
import styles from "./plastic-price-table.module.css";

type DraftRow = Omit<PriceRow, "price"> & { price: string };
type DraftGroup = Omit<PriceGroup, "rows"> & { rows: DraftRow[] };

function toDraft(groups: PriceGroup[]): DraftGroup[] {
  return groups.map((group) => ({ ...group, rows: group.rows.map((row) => ({
    ...row, price: row.price === null ? "" : String(row.price),
  })) }));
}

function numberLabel(value: number) {
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function updatedLabel(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

type EditorAccount = { id: string; username: string; isActive: boolean; granted: boolean };

function PriceTableEditorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [users, setUsers] = useState<EditorAccount[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await loadPriceTableEditors();
        if (cancelled) return;
        if (!result.ok) { setError(result.message); return; }
        setUsers(result.users);
        setSelected(result.users.filter((item) => item.granted).map((item) => item.id));
        setError("");
      } catch {
        if (!cancelled) setError("授权名单加载失败，请稍后重试。");
      }
    });
    return () => { cancelled = true; };
  }, [open]);

  function saveGrants() {
    startTransition(async () => {
      try {
        const result = await savePriceTableEditors(selected);
        if (!result.ok) { setError(result.message); toast.error("授权保存失败", { description: result.message }); return; }
        setError("");
        toast.success("编辑授权已保存");
        onOpenChange(false);
      } catch {
        setError("授权保存失败，请稍后重试。");
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogBackdrop} />
        <Dialog.Content className={styles.dialog} aria-describedby="price-editor-description">
          <div className={styles.dialogHeader}>
            <div>
              <Dialog.Title>价格表编辑授权</Dialog.Title>
              <Dialog.Description id="price-editor-description" className={styles.dialogIntro}>勾选后，这些账号可以看到并使用“编辑价格表”。超级管理员始终可以编辑。</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className={styles.iconButton} type="button" aria-label="关闭"><X aria-hidden="true" /></button></Dialog.Close>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {users.length === 0 ? (error ? null : <p className={styles.editorEmpty}>{pending ? "正在读取账号…" : "还没有可授权的业务账号。"}</p>) : (
            <div className={styles.editorList}>
              {users.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <label className={styles.editorOption} key={item.id} data-checked={checked || undefined}>
                    <input type="checkbox" checked={checked} disabled={pending} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} />
                    <span>{item.username}</span>
                    <small>{item.isActive ? "普通业务员" : "已停用"}</small>
                  </label>
                );
              })}
            </div>
          )}
          <div className={styles.dialogFooter}>
            <Dialog.Close asChild><button className={styles.secondary} type="button">取消</button></Dialog.Close>
            <button className={styles.primary} type="button" disabled={pending || users.length === 0} onClick={saveGrants}><Save aria-hidden="true" />{pending ? "保存中…" : "保存授权"}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PlasticPriceTable({ active }: { active: boolean }) {
  const [table, setTable] = useState<PriceTableData | null>(null);
  const [stock, setStock] = useState<PriceStock[]>([]);
  const [date, setDate] = useState("");
  const [draft, setDraft] = useState<DraftGroup[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canManageEditors, setCanManageEditors] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    startTransition(async () => {
      try {
        const result = await loadPlasticPriceTable();
        if (cancelled) return;
        // Re-entering refreshes inventory while preserving the editing session.
        setTable((previous) => previous ?? result.table);
        setStock(result.stock);
        setDate(result.date);
        setCanEdit(result.canEdit);
        setCanManageEditors(result.canManageEditors);
        setError("");
      } catch {
        if (!cancelled) setError("价格表加载失败，请检查连接后重试。");
      }
    });
    return () => { cancelled = true; };
  }, [active]);

  const dirty = draft !== null && table !== null && JSON.stringify(draft) !== JSON.stringify(toDraft(table.groups));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function refresh() {
    startTransition(async () => {
      try {
        const result = await loadPlasticPriceTable();
        setTable(result.table);
        setStock(result.stock);
        setDate(result.date);
        setCanEdit(result.canEdit);
        setCanManageEditors(result.canManageEditors);
        setError("");
        toast.success("价格表与库存已刷新");
      } catch { setError("刷新失败，请检查连接后重试。"); }
    });
  }

  function updateRow(groupId: string, rowId: string, changes: Partial<DraftRow>) {
    setDraft((current) => current?.map((group) => group.id === groupId ? {
      ...group, rows: group.rows.map((row) => row.id === rowId ? { ...row, ...changes } : row),
    } : group) ?? null);
  }

  function moveGroup(index: number, direction: number) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !table) return;
    const groups = draft.map((group) => ({ ...group, rows: group.rows.map((row) => ({
      ...row, price: row.price.trim() === "" ? null : Number(row.price),
    })) }));
    startTransition(async () => {
      try {
        const result = await savePlasticPriceTable({ groups, version: table.version });
        if (!result.ok) { setError(result.message); toast.error("价格表保存失败", { description: result.message }); return; }
        setTable(result.table);
        setDraft(null);
        setError("");
        toast.success("价格表已保存", { description: "类别、编号和时价已同步" });
      } catch { setError("保存失败，编辑内容已保留，请稍后重试。"); }
    });
  }

  const groups = draft ?? table?.groups ?? [];
  const rowCount = Math.max(1, ...groups.map((group) => group.rows.length));
  const totalRows = groups.reduce((count, group) => count + group.rows.length, 0);

  return (
    <section className={styles.panel} aria-label="塑料价格表" aria-busy={pending}>
      <form onSubmit={save}>
        <fieldset disabled={pending} className={styles.fieldset}>
          <div className={styles.toolbar}>
            <div className={styles.summary}><Table2 aria-hidden="true" /><span>{groups.length} 个类别 · {totalRows} 项报价</span>{draft && <span className={styles.draftState}>{dirty ? "有未保存修改" : "编辑中"}</span>}</div>
            <div className={styles.actions}>
              {draft ? <>
                <button key="add-group" className={styles.secondary} type="button" disabled={draft.length >= 20} onClick={() => setDraft([...draft, { id: createClientId(), title: "新类别", rows: [] }])}><Plus aria-hidden="true" />添加类别</button>
                <button key="cancel-edit" className={styles.secondary} type="button" onClick={() => { setDraft(null); setError(""); }}><X aria-hidden="true" />取消编辑</button>
                <button key="save-table" className={styles.primary} type="submit"><Save aria-hidden="true" />{pending ? "保存中…" : "保存价格表"}</button>
              </> : <>
                <button key="refresh-stock" className={styles.secondary} type="button" onClick={refresh}><RefreshCw aria-hidden="true" />{pending ? "加载中…" : "刷新库存"}</button>
                {canManageEditors && <button key="grant-editors" className={styles.secondary} type="button" onClick={() => setGrantOpen(true)}><ShieldCheck aria-hidden="true" />编辑授权</button>}
                {canEdit && <button key="edit-table" className={styles.primary} type="button" disabled={!table} onClick={(event) => { event.preventDefault(); setDraft(toDraft(table!.groups)); setError(""); }}><Pencil aria-hidden="true" />编辑价格表</button>}
              </>}
            </div>
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {!table ? <div className={styles.empty} role="status">{pending ? "正在读取价格表与库存…" : "点击刷新库存，重新加载价格表。"}</div> : <>
            <div className={styles.dateBar}><h2>{date}</h2><span>{table.updatedAt ? `报价更新于 ${updatedLabel(table.updatedAt)}` : "尚未保存报价"}</span></div>
            {draft && <p className={styles.editHint}>类别名称就是第一列表头。填写库存中的塑料编号后，库存包数会自动带出，不能手动修改。时价单位：元/吨。</p>}
            <div className={styles.tableScroll} tabIndex={0} aria-label="价格表，可横向滚动">
              <table className={`${styles.table} ${draft ? styles.editTable : ""}`}>
                <caption className={styles.srOnly}>塑料报价，每个类别为塑料编号、时价（元/吨）、库存包数三列。</caption>
                <thead><tr>{groups.map((group, index) => <Fragment key={group.id}>
                  <th scope="col" className={styles.groupStart}>
                    {draft ? <>
                      <input className={styles.categoryInput} aria-label={`第 ${index + 1} 组类别名称`} value={group.title} maxLength={50} required onChange={(event) => setDraft(draft.map((item) => item.id === group.id ? { ...item, title: event.target.value } : item))} />
                      <div className={styles.groupActions}>
                        <button className={styles.iconButton} type="button" aria-label={`左移${group.title}`} disabled={index === 0} onClick={() => moveGroup(index, -1)}><ArrowLeft aria-hidden="true" /></button>
                        <button className={styles.iconButton} type="button" aria-label={`右移${group.title}`} disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}><ArrowRight aria-hidden="true" /></button>
                        <button className={styles.iconButton} type="button" aria-label={`移除${group.title}类别`} disabled={groups.length === 1} onClick={() => setDraft(draft.filter((item) => item.id !== group.id))}><Trash2 aria-hidden="true" /></button>
                      </div>
                    </> : <strong>{group.title}</strong>}
                    <small>塑料编号</small>
                  </th>
                  <th scope="col">时价<small>元/吨</small></th>
                  <th scope="col">库存<small>包数</small></th>
                </Fragment>)}</tr></thead>
                <tbody>{Array.from({ length: rowCount }, (_, rowIndex) => <tr key={rowIndex}>{groups.map((group) => {
                  const row = group.rows[rowIndex];
                  if (!row) return <td key={group.id} colSpan={3} className={`${styles.groupStart} ${styles.blank}`}>{rowIndex === 0 ? "暂无塑料" : ""}</td>;
                  const match = row.code.trim() ? stockForCode(stock, row.code) : undefined;
                  const label = `${group.title}第 ${rowIndex + 1} 行`;
                  return <Fragment key={group.id}>
                    <td className={`${styles.groupStart} ${styles.codeCell}`}>
                      {draft ? <div className={styles.rowEditor}>
                        <MaterialCodeCombobox label={`${label}塑料编号`} value={row.code} options={stock} disabled={pending || !active} onValueChange={(code) => updateRow(group.id, row.id, { code })} />
                        <button className={styles.iconButton} type="button" aria-label={`删除${label}`} onClick={() => setDraft(draft.map((item) => item.id === group.id ? { ...item, rows: item.rows.filter((entry) => entry.id !== row.id) } : item))}><X aria-hidden="true" /></button>
                      </div> : row.code}
                    </td>
                    <td className={styles.priceCell}>{draft ? <input className={styles.input} type="number" inputMode="decimal" min="0" max="999999999" step="0.01" aria-label={`${label}时价`} value={row.price ?? ""} placeholder="待报价" onChange={(event) => updateRow(group.id, row.id, { price: event.target.value })} /> : row.price === null ? <span className={styles.muted}>待报价</span> : `¥ ${numberLabel(Number(row.price))}`}</td>
                    <td className={styles.stockCell}>
                      {match ? <span className={styles.connected}>{numberLabel(match.packs)}</span> : <><span className={styles.muted}>—</span><small>未关联</small></>}
                    </td>
                  </Fragment>;
                })}</tr>)}</tbody>
                {draft && <tfoot><tr>{draft.map((group) => <td key={group.id} colSpan={3} className={styles.groupStart}>
                  <button className={styles.addRow} type="button" disabled={group.rows.length >= 100 || totalRows >= 1000} onClick={() => setDraft(draft.map((item) => item.id === group.id ? { ...item, rows: [...item.rows, { id: createClientId(), code: "", price: "" }] } : item))}><Plus aria-hidden="true" />添加塑料</button>
                </td>)}</tr></tfoot>}
              </table>
            </div>
            {totalRows === 0 && !draft && <div className={styles.empty}><Table2 aria-hidden="true" /><strong>还没有报价内容</strong><span>点击“编辑价格表”，自定义类别并添加塑料编号和时价。</span></div>}
            <div className={styles.footer}><span>库存包数按塑料编号从库存汇总，不能手动修改。</span><span>左右滚动查看全部类别</span></div>
          </>}
        </fieldset>
      </form>
      {canManageEditors && <PriceTableEditorDialog open={grantOpen} onOpenChange={setGrantOpen} />}
    </section>
  );
}
