"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { CalendarRange, ChevronDown, PackageCheck, RotateCcw, Save, Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { pinyin } from "pinyin-pro";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInboundRecord, deleteInboundRecord, listInboundRecords } from "./actions";
import styles from "./inbound.module.css";

type MaterialOption = { id: number; code: string; name: string };
type InboundRecord = {
  id: number;
  code: string;
  name: string;
  packCount: number;
  inboundUnitPrice: number | null;
  taxIncluded: boolean;
  createdAt: string;
};
type InboundData = { data: InboundRecord[]; total: number; page: number; pageSize: number };
const emptyForm = {
  code: "",
  name: "",
  packCount: "",
  inboundUnitPrice: "",
  taxIncluded: "false",
  createdAt: "",
};

function matchesMaterial(material: MaterialOption, query: string) {
  const normalized = query.toLocaleLowerCase().replace(/\s+/g, "");
  return [material.code, material.name].some((value) => {
    const direct = value.toLocaleLowerCase();
    if (direct.includes(normalized)) return true;
    try {
      const full = pinyin(value, { toneType: "none" }).toLocaleLowerCase().replace(/\s+/g, "");
      const initials = pinyin(value, { pattern: "first", toneType: "none" }).toLocaleLowerCase().replace(/\s+/g, "");
      return full.includes(normalized) || initials.includes(normalized);
    } catch {
      return false;
    }
  });
}

function formatPrice(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value)).replaceAll("/", "-");
}

function pageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, Math.max(current + 2, 5));
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function InboundWorkbench({ initialData, materials }: { initialData: InboundData; materials: MaterialOption[] }) {
  const [form, setForm] = useState(emptyForm);
  const [rows, setRows] = useState(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [jumpPage, setJumpPage] = useState(String(initialData.page));
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [deleteTarget, setDeleteTarget] = useState<InboundRecord | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = useMemo(() => pageNumbers(page, pages), [page, pages]);
  const suggestions = useMemo(() => {
    const query = form.code.trim();
    if (!query) return [];
    return materials.filter((material) => matchesMaterial(material, query)).slice(0, 8);
  }, [form.code, materials]);

  const showToast = useCallback((kind: "success" | "error", title: string, description: string) => {
    toast[kind](title, { description });
  }, []);

  const refresh = useCallback((nextPage: number, nextSize: number, nextStart: string, nextEnd: string) => {
    startTransition(async () => {
      try {
        const result = await listInboundRecords(nextStart, nextEnd, nextPage, nextSize);
        setRows(result.data);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
        setJumpPage(String(result.page));
      } catch {
        showToast("error", "入库记录加载失败", "请检查连接后重试");
      }
    });
  }, [showToast]);

  const selectMaterial = (material: MaterialOption) => {
    setForm((current) => ({ ...current, code: material.code, name: material.name }));
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
  };

  const handleCodeKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestionsOpen || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      selectMaterial(suggestions[activeSuggestion]);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setSuggestionsOpen(false);
    setActiveSuggestion(-1);
    formRef.current?.reset();
  };

  const submitInbound = (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = await createInboundRecord(formData);
        if (!result.ok) {
          showToast("error", "入库登记失败", result.message || "请检查输入内容");
          return;
        }
        resetForm();
        showToast("success", "入库登记成功", "库存数量与入库流水已同步");
        refresh(1, pageSize, startDate, endDate);
      } catch {
        showToast("error", "入库登记失败", "服务暂时不可用，请重试");
      }
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      try {
        const result = await deleteInboundRecord(target.id);
        if (!result.ok) {
          showToast("error", "入库记录删除失败", result.message || "请稍后重试");
          return;
        }
        showToast("success", "入库记录已删除", "对应库存数量已经扣减");
        refresh(rows.length === 1 && page > 1 ? page - 1 : page, pageSize, startDate, endDate);
      } catch {
        showToast("error", "入库记录删除失败", "请稍后重试");
      }
    });
  };

  const updateStartDate = (value: string) => {
    setStartDate(value);
    refresh(1, pageSize, value, endDate);
  };

  const updateEndDate = (value: string) => {
    setEndDate(value);
    refresh(1, pageSize, startDate, value);
  };

  const goToPage = (nextPage: number) => refresh(Math.min(pages, Math.max(1, nextPage)), pageSize, startDate, endDate);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><PackageCheck aria-hidden="true" />库存接入终端</p>
          <h1>入库登记</h1>
          <p>登记到货包数、吨价与税态，保存后立即计入库存。</p>
        </div>
        <span className={styles.liveBadge}><span />INBOUND LINK READY</span>
      </header>

      <section className={styles.entryPanel} aria-labelledby="inbound-entry-heading">
        <div className={styles.panelHeader}>
          <div><h2 id="inbound-entry-heading">新建入库指令</h2><p>可选择库存目录中的塑料，也可以直接手动录入。</p></div>
          <span className={styles.stepReadout}>READY / WRITE</span>
        </div>
        <form ref={formRef} className={styles.entryForm} action={submitInbound}>
          <div className={styles.field}>
            <label htmlFor="inbound-code">塑料编号</label>
            <div className={styles.autocomplete}>
              <Input
                id="inbound-code"
                name="code"
                value={form.code}
                onChange={(event) => { setForm((current) => ({ ...current, code: event.target.value })); setSuggestionsOpen(Boolean(event.target.value.trim())); setActiveSuggestion(-1); }}
                onFocus={() => setSuggestionsOpen(Boolean(form.code.trim()))}
                onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                onKeyDown={handleCodeKeyDown}
                placeholder="输入编号、名称或拼音"
                autoComplete="off"
                aria-autocomplete="list"
                aria-controls="material-suggestions"
                aria-expanded={suggestionsOpen && suggestions.length > 0}
                required
              />
              <ChevronDown aria-hidden="true" />
              {suggestionsOpen && suggestions.length > 0 && (
                <div className={styles.suggestions} id="material-suggestions" role="listbox">
                  {suggestions.map((material, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === activeSuggestion}
                      data-active={index === activeSuggestion || undefined}
                      key={material.id}
                      onMouseDown={(event) => { event.preventDefault(); selectMaterial(material); }}
                    >
                      <span>{material.code}</span><strong>{material.name}</strong>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className={styles.field}>
            <label htmlFor="inbound-name">塑料名称</label>
            <Input id="inbound-name" name="name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="自动带出或手动填写" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="inbound-packs">包数</label>
            <Input id="inbound-packs" name="packCount" type="number" min={1} step={1} inputMode="numeric" value={form.packCount} onChange={(event) => setForm((current) => ({ ...current, packCount: event.target.value }))} placeholder="输入整数包数" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="inbound-price">入库价格</label>
            <div className={styles.priceField}><Input id="inbound-price" name="inboundUnitPrice" type="number" min={0} step="0.01" inputMode="decimal" value={form.inboundUnitPrice} onChange={(event) => setForm((current) => ({ ...current, inboundUnitPrice: event.target.value }))} placeholder="0.00" required /><span>元 / 吨</span></div>
          </div>
          <fieldset className={styles.taxField}>
            <legend>是否含税</legend>
            <div className={styles.taxOptions}>
              <label data-selected={form.taxIncluded === "false" || undefined}><input type="radio" name="taxIncluded" value="false" checked={form.taxIncluded === "false"} onChange={(event) => setForm((current) => ({ ...current, taxIncluded: event.target.value }))} /><span>不含税</span></label>
              <label data-selected={form.taxIncluded === "true" || undefined}><input type="radio" name="taxIncluded" value="true" checked={form.taxIncluded === "true"} onChange={(event) => setForm((current) => ({ ...current, taxIncluded: event.target.value }))} /><span>含税</span></label>
            </div>
          </fieldset>
          <div className={styles.field}>
            <label htmlFor="inbound-date">入库日期</label>
            <Input id="inbound-date" name="createdAt" type="date" value={form.createdAt} onChange={(event) => setForm((current) => ({ ...current, createdAt: event.target.value }))} />
            <small>留空时使用当前时间。</small>
          </div>
          <div className={styles.formActions}>
            <Button type="button" className={styles.secondaryButton} variant="outline" onClick={resetForm} disabled={pending}><RotateCcw size={14} />重置</Button>
            <Button type="submit" className={styles.primaryButton} disabled={pending}><Save size={14} />{pending ? "写入中…" : "保存入库"}</Button>
          </div>
        </form>
      </section>

      <section className={styles.ledger} aria-labelledby="inbound-ledger-heading" aria-busy={pending}>
        <div className={styles.ledgerHeader}>
          <div><h2 id="inbound-ledger-heading">入库记录</h2><p>删除流水后，对应塑料的库存包数会同步减少。</p></div>
          <div className={styles.dateRange}>
            <CalendarRange aria-hidden="true" />
            <label><span>开始日期</span><input type="date" value={startDate} max={endDate || undefined} onChange={(event) => updateStartDate(event.target.value)} aria-label="筛选开始日期" /></label>
            <span className={styles.rangeSeparator}>至</span>
            <label><span>结束日期</span><input type="date" value={endDate} min={startDate || undefined} onChange={(event) => updateEndDate(event.target.value)} aria-label="筛选结束日期" /></label>
            {(startDate || endDate) && <button type="button" className={styles.clearRange} onClick={() => { setStartDate(""); setEndDate(""); refresh(1, pageSize, "", ""); }}>清除</button>}
          </div>
        </div>
        <div className={styles.tableWrap}>
          {rows.length === 0 ? (
            <div className={styles.empty}><PackageCheck aria-hidden="true" /><strong>暂无入库记录</strong><span>填写上方指令，或调整日期范围。</span></div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>塑料编号</th><th>塑料名称</th><th>包数</th><th>入库价格</th><th>是否含税</th><th>时间</th><th>操作</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.code}>{row.code}</td>
                  <td className={styles.materialName}>{row.name}</td>
                  <td className={styles.packCount}>{row.packCount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
                  <td className={styles.price}>{formatPrice(row.inboundUnitPrice)}</td>
                  <td>{row.inboundUnitPrice === null ? <span className={styles.muted}>—</span> : <span className={styles.taxBadge} data-included={row.taxIncluded || undefined}>{row.taxIncluded ? "是" : "否"}</span>}</td>
                  <td className={styles.date}>{formatDate(row.createdAt)}</td>
                  <td><Button className={styles.dangerButton} variant="outline" onClick={() => setDeleteTarget(row)}><Trash2 size={13} />删除</Button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className={styles.pager}>
          <span className={styles.total}>共 {total} 条</span>
          <label className={styles.pageSize}>每页<select value={pageSize} onChange={(event) => { const size = Number(event.target.value); setPageSize(size); refresh(1, size, startDate, endDate); }} aria-label="每页显示条数">{[10, 20, 50, 100].map((size) => <option value={size} key={size}>{size}</option>)}</select></label>
          <nav className={styles.pageButtons} aria-label="入库记录分页">
            <button onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="上一页">‹</button>
            {visiblePages.map((number) => <button key={number} data-current={number === page || undefined} aria-current={number === page ? "page" : undefined} onClick={() => goToPage(number)}>{number}</button>)}
            <button onClick={() => goToPage(page + 1)} disabled={page >= pages} aria-label="下一页">›</button>
          </nav>
          <form className={styles.jump} onSubmit={(event) => { event.preventDefault(); goToPage(Number(jumpPage) || 1); }}><span>前往</span><input value={jumpPage} onChange={(event) => setJumpPage(event.target.value)} inputMode="numeric" aria-label="跳转页码" /><span>页</span></form>
        </div>
      </section>

      <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogBackdrop} />
          <AlertDialog.Content className={styles.confirmDialog}>
            <AlertDialog.Title className={styles.confirmTitle}>确认删除入库记录？</AlertDialog.Title>
            <AlertDialog.Description className={styles.confirmDescription}>确定删除“{deleteTarget?.code} {deleteTarget?.name} {deleteTarget?.packCount} 包”吗？删除后对应库存会减少。</AlertDialog.Description>
            <div className={styles.dialogFooter}><AlertDialog.Cancel asChild><Button type="button" className={styles.secondaryButton} variant="outline">取消</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button type="button" className={styles.dangerButton} onClick={confirmDelete}>确认删除</Button></AlertDialog.Action></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
