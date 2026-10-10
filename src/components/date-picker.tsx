"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { TZDate, type DateRange } from "react-day-picker";
import { zhCN } from "react-day-picker/locale";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import styles from "./date-picker.module.css";

const timeZone = "Asia/Shanghai";

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new TZDate(year, month - 1, day, timeZone);
  return format(date, "yyyy-MM-dd") === value ? date : undefined;
}

function dateValue(date: Date | undefined) {
  return date ? format(new TZDate(date, timeZone), "yyyy-MM-dd") : "";
}

function today() {
  return new TZDate(Date.now(), timeZone);
}

type DatePickerProps = {
  id: string;
  name?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  describedBy?: string;
};

export function DatePicker({ id, name, label, value, onValueChange, className, disabled, describedBy }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>();
  const selected = parseDay(value);

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) setMonth(selected || today());
    setOpen(nextOpen);
  };

  const selectDate = (date: Date | undefined) => {
    onValueChange(dateValue(date));
    setOpen(false);
  };

  return (
    <>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger asChild>
          <Button id={id} type="button" variant="outline" className={cn(styles.trigger, className)} data-empty={!value || undefined} disabled={disabled} aria-label={label} aria-describedby={describedBy}>
            <CalendarDays aria-hidden="true" />
            <span>{value || "选择日期"}</span>
            <ChevronDown className={styles.chevron} aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={6} collisionPadding={12} className={styles.content} aria-label={`${label}选择器`}>
          <div className={styles.heading}>{label}</div>
          <Calendar mode="single" locale={zhCN} timeZone={timeZone} weekStartsOn={1} fixedWeeks selected={selected} month={month} onMonthChange={setMonth} onSelect={selectDate} autoFocus className={styles.calendar} />
          <div className={styles.footer}>
            <Button type="button" variant="ghost" className={styles.action} onClick={() => selectDate(today())}>今天</Button>
            <Button type="button" variant="ghost" className={styles.action} onClick={() => selectDate(undefined)}>清空</Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}

export type DateRangeValue = { start: string; end: string };

type DateRangePickerProps = {
  value: DateRangeValue;
  onValueChange: (value: DateRangeValue) => void;
  className?: string;
  disabled?: boolean;
};

export function DateRangePicker({ value, onValueChange, className, disabled }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>();
  const [draft, setDraft] = useState<DateRange>();
  const summary = value.start && value.end ? `${value.start} 至 ${value.end}` : value.start ? `${value.start} 起` : value.end ? `截至 ${value.end}` : "选择日期范围";

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(value.start || value.end ? { from: parseDay(value.start), to: parseDay(value.end) } : undefined);
      setMonth(parseDay(value.start) || parseDay(value.end) || today());
    }
    setOpen(nextOpen);
  };

  const apply = (range: DateRange | undefined) => {
    onValueChange({ start: dateValue(range?.from), end: dateValue(range?.to || range?.from) });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn(styles.trigger, styles.rangeTrigger, className)} data-empty={!value.start && !value.end || undefined} disabled={disabled} aria-label="筛选入库日期范围">
          <CalendarRange aria-hidden="true" />
          <span>{summary}</span>
          <ChevronDown className={styles.chevron} aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className={styles.content} aria-label="入库日期范围选择器">
        <div className={styles.heading}>选择日期范围<small>依次选择开始日期和结束日期</small></div>
        <Calendar mode="range" locale={zhCN} timeZone={timeZone} weekStartsOn={1} fixedWeeks selected={draft} month={month} onMonthChange={setMonth} onSelect={setDraft} autoFocus className={styles.calendar} />
        <p className={styles.rangeSummary} aria-live="polite">{draft?.from ? `${dateValue(draft.from)} 至 ${dateValue(draft.to || draft.from)}` : "尚未选择日期"}</p>
        <div className={styles.footer}>
          <Button type="button" variant="ghost" className={styles.action} onClick={() => { const date = today(); apply({ from: date, to: date }); }}>今天</Button>
          <Button type="button" variant="ghost" className={styles.action} onClick={() => apply(undefined)}>清空</Button>
          <Button type="button" className={styles.apply} disabled={!draft?.from} onClick={() => apply(draft)}>应用筛选</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
