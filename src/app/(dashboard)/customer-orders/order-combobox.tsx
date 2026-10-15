"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { pinyin } from "pinyin-pro";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import styles from "./orders.module.css";

type Option = { code: string; name: string };

export function OrderCombobox({ id, value, onChange, onSelect, options, label, maxLength = 50, showEmpty = false, placeholder }: {
  id?: string;
  value: string; onChange: (value: string) => void; onSelect: (option: Option) => void;
  options: readonly Option[]; label: string; maxLength?: number; showEmpty?: boolean; placeholder: string;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typing, setTyping] = useState(false);
  const indexed = useMemo(() => [...new Map(options.map((option) => [JSON.stringify([option.code, option.name]), option])).values()].map((option) => {
    const text = `${option.code} ${option.name}`;
    return { option, search: [text, pinyin(text, { toneType: "none" }), pinyin(text, { pattern: "first", toneType: "none" })].map((part) => part.toLowerCase().replace(/\s+/g, "")) };
  }), [options]);
  const query = showEmpty && !typing ? "" : value.trim().toLowerCase().replace(/\s+/g, "");
  const matches = (!query && !showEmpty ? [] : indexed.filter((item) => item.search.some((part) => part.includes(query)))).slice(0, 30);

  function select(option: Option) {
    onSelect(option);
    setOpen(false);
    setActive(-1);
  }

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild><div className={styles.combo}>
      <input id={id} ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        required autoComplete="off" maxLength={maxLength} value={value} placeholder={placeholder}
        onFocus={() => { setOpen(true); setTyping(false); setActive(-1); }}
        onChange={(event) => { onChange(event.target.value); setTyping(true); setOpen(true); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            const next = !matches.length ? -1 : active < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (active + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length;
            setActive(next);
            document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
          } else if (event.key === "Enter" && open) {
            event.preventDefault();
            if (matches[active]) select(matches[active].option);
            else if (showEmpty && matches[0]) select(matches[0].option);
            else setOpen(false);
          } else if (event.key === "Escape" || event.key === "Tab") setOpen(false);
        }} />
      <button type="button" aria-label={`展开${label}选项`} onMouseDown={(event) => event.preventDefault()}
        onClick={() => { input.current?.focus(); setOpen(!open); setActive(-1); }}><ChevronDown aria-hidden="true" /></button>
    </div></PopoverAnchor>
    <PopoverContent id={listId} role="listbox" aria-label={`${label}选项`} className={styles.comboOptions} align="start" collisionPadding={12}
      onOpenAutoFocus={(event) => event.preventDefault()} onCloseAutoFocus={(event) => event.preventDefault()}
      onInteractOutside={(event) => { if (input.current?.parentElement?.contains(event.target as Node)) event.preventDefault(); }}>
      {matches.map(({ option }, index) => <div key={JSON.stringify([option.code, option.name])} id={`${listId}-${index}`} role="option" aria-selected={option.code === value}
        className={styles.comboOption} data-active={index === active || undefined} onPointerMove={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(option)}>
        <span><strong>{option.code}</strong>{option.name && <small>{option.name}</small>}</span>{value === option.code && <Check aria-hidden="true" />}
      </div>)}
      {!matches.length && <p className={styles.comboNote}>{query ? "暂无匹配项，可直接手填。" : "输入编号、名称、拼音或首字母搜索。"}</p>}
    </PopoverContent>
  </Popover>;
}
