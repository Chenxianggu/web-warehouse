"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import styles from "./price-trends.module.css";

export function ItemCodeSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (code: string) => void }) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(-1);
  const matches = options.filter((code) => code.toLowerCase().includes(search.trim().toLowerCase()));
  function choose(code: string) { onChange(code); input.current?.focus(); setOpen(false); setActive(-1); }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild><div className={styles.selectControl}>
      <input id="trend-item-code" ref={input} role="combobox" aria-label="货号" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined} value={open ? search : value} placeholder={open ? "输入货号搜索" : "选择货号"} autoComplete="off" maxLength={100}
        onFocus={() => { setSearch(""); setActive(-1); setOpen(true); }} onChange={(event) => { setSearch(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            const next = !matches.length ? -1 : active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
            setActive(next); document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && open) {
            event.preventDefault(); if (matches[active] || matches[0]) choose(matches[active] ?? matches[0]);
          } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
          else if (event.key === "Tab") setOpen(false);
        }} />
      {value && <button type="button" aria-label="清空货号" onMouseDown={(event) => event.preventDefault()} onClick={() => choose("")}><X aria-hidden="true" /></button>}
      <button type="button" aria-label="展开货号选项" onMouseDown={(event) => event.preventDefault()} onClick={() => { setSearch(""); setActive(-1); setOpen(!open); }}><ChevronDown aria-hidden="true" /></button>
    </div></PopoverAnchor>
    <PopoverContent id={listId} role="listbox" aria-label="货号选项" className={styles.options} align="start" collisionPadding={12}
      onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => { if (input.current?.parentElement?.contains(event.target as Node)) event.preventDefault(); }}>
      {matches.map((code, index) => <div id={`${listId}-${index}`} key={code} role="option" aria-selected={code === value} data-active={active === index || undefined} className={styles.option}
        onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(code)}><span>{code}</span>{code === value && <Check aria-hidden="true" />}</div>)}
      {!matches.length && <p className={styles.optionEmpty}>{options.length ? "没有匹配的货号" : "暂无订货货号"}</p>}
    </PopoverContent>
  </Popover>;
}
