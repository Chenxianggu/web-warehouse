"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import styles from "./material-code-combobox.module.css";

type MaterialOption = { code: string; name: string };

export function MaterialCodeCombobox({ value, onValueChange, options, label, disabled = false }: {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly MaterialOption[];
  label: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const query = value.trim().toLocaleLowerCase();
  const matches = options.filter((item) => `${item.code} ${item.name}`.toLocaleLowerCase().includes(query));
  const visibleOptions = matches.slice(0, 50);
  const expanded = open && !disabled;
  const activeOption = expanded && visibleOptions[activeIndex] ? `${listId}-${activeIndex}` : undefined;

  useEffect(() => {
    if (activeOption) listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeOption]);

  function choose(code: string) {
    onValueChange(code);
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <Popover open={expanded} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={styles.control}>
          <input
            ref={inputRef}
            role="combobox"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listId : undefined}
            aria-activedescendant={activeOption}
            autoComplete="off"
            value={value}
            maxLength={50}
            required
            disabled={disabled}
            placeholder="选择或输入编号"
            onFocus={() => { setOpen(true); setActiveIndex(-1); }}
            onChange={(event) => { onValueChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActiveIndex((current) => {
                  if (!visibleOptions.length) return -1;
                  if (!expanded || current < 0) return event.key === "ArrowDown" ? 0 : visibleOptions.length - 1;
                  return (current + (event.key === "ArrowDown" ? 1 : -1) + visibleOptions.length) % visibleOptions.length;
                });
              } else if (event.key === "Enter" && expanded) {
                event.preventDefault();
                if (visibleOptions[activeIndex]) choose(visibleOptions[activeIndex].code);
                else setOpen(false);
              } else if (event.key === "Escape" && expanded) {
                event.preventDefault();
                setOpen(false);
              } else if (event.key === "Tab") setOpen(false);
            }}
          />
          <button type="button" disabled={disabled} aria-label={`${expanded ? "收起" : "展开"}${label}选项`} aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => { inputRef.current?.focus(); setOpen(!expanded); setActiveIndex(-1); }}>
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={`${label}库存选项`}
        className={styles.content}
        align="start"
        sideOffset={5}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => { if (event.target === inputRef.current || inputRef.current?.parentElement?.contains(event.target as Node)) event.preventDefault(); }}
      >
        {visibleOptions.map((item, index) => (
          <div key={item.code} id={`${listId}-${index}`} role="option" aria-selected={item.code === value}
            className={styles.option} data-highlighted={index === activeIndex}
            onPointerMove={() => setActiveIndex(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(item.code)}>
            <span><strong>{item.code}</strong><small>{item.name}</small></span>
            {item.code === value && <Check aria-hidden="true" />}
          </div>
        ))}
        {matches.length === 0 && <p className={styles.note} role="status">暂无匹配库存，可继续使用当前编号。</p>}
        {matches.length > 50 && <p className={styles.note}>显示前 50 项，输入编号或名称缩小范围。</p>}
      </PopoverContent>
    </Popover>
  );
}
