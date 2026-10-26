"use client";

import { Select, SelectOption } from "@/components/ui/select";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Boxes, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createMaterial, deleteMaterial, listMaterials, updateMaterial } from "./actions";
import styles from "./stock.module.css";

type Material = {
  id: number;
  code: string;
  name: string;
  packsPerTon: number;
  totalPack: number;
  honghaiPack: number;
  exTaxAvgPrice: number | null;
  createdAt: string;
};

type InventoryData = {
  data: Material[];
  total: number;
  page: number;
  pageSize: number;
  canViewAveragePrice: boolean;
};

function formatTons(material: Material) {
  return (material.totalPack / (material.packsPerTon || 40)).toFixed(3);
}

function formatPrice(value: number | null) {
  return value === null
    ? "—"
    : value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pageNumbers(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, Math.max(current + 2, 5));
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export function InventoryWorkbench({ initialData }: { initialData: InventoryData }) {
  const [rows, setRows] = useState(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<Material | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [jumpPage, setJumpPage] = useState(String(initialData.page));
  const [pending, startTransition] = useTransition();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = useMemo(() => pageNumbers(page, pages), [page, pages]);

  const showToast = useCallback((kind: "success" | "error", title: string, description: string) => {
    toast[kind](title, { description });
  }, []);

  const refresh = useCallback((nextPage: number, nextKeyword: string, nextSize: number) => {
    startTransition(async () => {
      try {
        const result = await listMaterials(nextKeyword, nextPage, nextSize);
        setRows(result.data);
        setTotal(result.total);
        setPage(result.page);
        setPageSize(result.pageSize);
        setJumpPage(String(result.page));
      } catch {
        showToast("error", "库存列表加载失败", "请检查连接后重试");
      }
    });
  }, [showToast]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextSearch = keyword.trim();
      setSearch(nextSearch);
      refresh(1, nextSearch, pageSize);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [keyword, pageSize, refresh]);

  const openCreate = () => {
    setEditing(null);
    setModal("create");
  };

  const openEdit = (material: Material) => {
    setEditing(material);
    setModal("edit");
  };

  const closeModal = () => {
    if (!pending) setModal(null);
  };

  const submitMaterial = (formData: FormData) => {
    startTransition(async () => {
      try {
        const result = editing ? await updateMaterial(formData) : await createMaterial(formData);
        if (!result.ok) {
          showToast("error", "塑料保存失败", result.message || "请检查输入内容");
          return;
        }
        setModal(null);
        showToast("success", editing ? "塑料资料已更新" : "塑料创建成功", "库存目录已同步");
        refresh(page, search, pageSize);
      } catch {
        showToast("error", "塑料保存失败", "服务暂时不可用，请重试");
      }
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    startTransition(async () => {
      try {
        const result = await deleteMaterial(target.id);
        if (!result.ok) {
          showToast("error", "塑料删除失败", result.message || "请稍后重试");
          return;
        }
        showToast("success", "塑料已删除", `“${target.name}”已从库存目录移除`);
        refresh(rows.length === 1 && page > 1 ? page - 1 : page, search, pageSize);
      } catch {
        showToast("error", "塑料删除失败", "请稍后重试");
      }
    });
  };

  const goToPage = (nextPage: number) => refresh(Math.min(pages, Math.max(1, nextPage)), search, pageSize);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><Boxes aria-hidden="true" />库存数据矩阵</p>
          <h1>库存管理</h1>
          <p>维护塑料主数据，实时核对包数、吨数与入库成本。</p>
        </div>
        <div className={styles.heroActions}>
          <span className={styles.liveBadge}><span />STOCK NODE ONLINE</span>
          <Button className={styles.primaryButton} onClick={openCreate}><Plus size={15} />新增塑料</Button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search aria-hidden="true" size={15} />
          <span className={styles.srOnly}>搜索塑料名称或编号</span>
          <Input className={styles.search} value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索塑料名称或编号" />
        </label>
        <span className={styles.count}>{pending ? "SYNCING..." : `${total} RECORDS`}</span>
      </div>

      <section className={styles.directory} aria-labelledby="inventory-directory-heading" aria-busy={pending}>
        <div className={styles.directoryHeader}>
          <div><h2 id="inventory-directory-heading">塑料库存目录</h2><p>本仓库与宏海仓分别计数；吨数依据每种塑料的每吨包数换算，×均价为本仓库成本。</p></div>
          <span className={styles.count}>PAGE {page} / {pages}</span>
        </div>
        <div className={styles.tableWrap}>
          {rows.length === 0 ? (
            <div className={styles.empty}><Boxes aria-hidden="true" /><strong>暂无匹配的塑料记录</strong><span>调整搜索条件，或新增第一种塑料。</span></div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>塑料编号</th><th>塑料名称</th><th>每吨包数</th><th>本仓库（包）</th><th>约（吨）</th><th>宏海仓</th>{initialData.canViewAveragePrice && <th>×均价</th>}<th>操作</th></tr></thead>
              <tbody>{rows.map((row) => (
                <tr key={row.id}>
                  <td className={styles.code}>{row.code}</td>
                  <td className={styles.materialName}>{row.name}</td>
                  <td className={styles.numeric}>{row.packsPerTon}</td>
                  <td className={styles.packCount}>{row.totalPack.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</td>
                  <td className={styles.numeric}>{formatTons(row)}</td>
                  <td className={styles.packCount}>{row.honghaiPack.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 包<small className={styles.warehouseTons}>约 {(row.honghaiPack / (row.packsPerTon || 40)).toFixed(3)} 吨</small></td>
                  {initialData.canViewAveragePrice && <td className={styles.price}>{formatPrice(row.exTaxAvgPrice)}</td>}
                  <td><div className={styles.actions}><Button className={styles.secondaryButton} variant="outline" onClick={() => openEdit(row)}><Pencil size={13} />编辑</Button><Button className={styles.dangerButton} variant="outline" onClick={() => setDeleteTarget(row)}><Trash2 size={13} />删除</Button></div></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className={styles.pager}>
          <span className={styles.total}>共 {total} 条</span>
          <label className={styles.pageSize}>每页
            <Select value={pageSize} onValueChange={(value) => setPageSize(Number(value))} aria-label="每页显示条数" size="sm">
              {[10, 20, 50, 100].map((size) => <SelectOption value={size} key={size}>{size}</SelectOption>)}
            </Select>
          </label>
          <nav className={styles.pageButtons} aria-label="库存列表分页">
            <button onClick={() => goToPage(page - 1)} disabled={page <= 1} aria-label="上一页">‹</button>
            {visiblePages.map((number) => <button key={number} data-current={number === page || undefined} aria-current={number === page ? "page" : undefined} onClick={() => goToPage(number)}>{number}</button>)}
            <button onClick={() => goToPage(page + 1)} disabled={page >= pages} aria-label="下一页">›</button>
          </nav>
          <form className={styles.jump} onSubmit={(event) => { event.preventDefault(); goToPage(Number(jumpPage) || 1); }}>
            <span>前往</span><input value={jumpPage} onChange={(event) => setJumpPage(event.target.value)} inputMode="numeric" aria-label="跳转页码" /><span>页</span>
          </form>
        </div>
      </section>

      <Dialog.Root open={Boolean(modal)} onOpenChange={(open) => !open && closeModal()}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.dialogBackdrop} />
          <Dialog.Content className={styles.dialog} aria-describedby="material-dialog-description">
            <div className={styles.dialogHeader}>
              <div><Dialog.Title>{editing ? "编辑塑料" : "新增塑料"}</Dialog.Title><Dialog.Description id="material-dialog-description" className={styles.dialogIntro}>{editing ? "修改塑料基础信息与吨包换算标准。" : "建立塑料主数据，初始库存将显示为零。"}</Dialog.Description></div>
              <Dialog.Close asChild><button className={styles.linkButton} aria-label="关闭"><X size={18} /></button></Dialog.Close>
            </div>
            <form className={styles.form} action={submitMaterial} key={editing?.id ?? "create"}>
              <input type="hidden" name="id" value={editing?.id ?? ""} />
              <div className={styles.field}><label htmlFor="material-code">塑料编号</label><Input id="material-code" name="code" defaultValue={editing?.code ?? ""} placeholder="例如：PP-T30S" required autoFocus /></div>
              <div className={styles.field}><label htmlFor="material-name">塑料名称</label><Input id="material-name" name="name" defaultValue={editing?.name ?? ""} placeholder="请输入塑料名称" required /></div>
              <div className={styles.field}><label htmlFor="material-packs">每吨包数</label><Input id="material-packs" name="packsPerTon" type="number" min={1} max={200} step={1} defaultValue={editing?.packsPerTon ?? 40} required /><small>用于包数与吨数换算，允许 1–200 包。</small></div>
              <div className={styles.dialogFooter}><Dialog.Close asChild><Button type="button" className={styles.secondaryButton} variant="outline">取消</Button></Dialog.Close><Button type="submit" className={styles.primaryButton} disabled={pending}>{pending ? "保存中…" : "确定"}</Button></div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <AlertDialog.Root open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={styles.dialogBackdrop} />
          <AlertDialog.Content className={styles.confirmDialog}>
            <AlertDialog.Title className={styles.confirmTitle}>确认删除塑料？</AlertDialog.Title>
            <AlertDialog.Description className={styles.confirmDescription}>确定删除“{deleteTarget?.name}（{deleteTarget?.code}）”吗？历史入库记录会保留，但该塑料将不再出现在库存目录中。</AlertDialog.Description>
            <div className={styles.dialogFooter}><AlertDialog.Cancel asChild><Button type="button" className={styles.secondaryButton} variant="outline">取消</Button></AlertDialog.Cancel><AlertDialog.Action asChild><Button type="button" className={styles.dangerButton} onClick={confirmDelete}>确认删除</Button></AlertDialog.Action></div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}
