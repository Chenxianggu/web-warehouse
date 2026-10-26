"use client";

import type { ComponentProps, ReactNode } from "react";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "cn";
import styles from "./select.module.css";

type SelectProps = Omit<ComponentProps<typeof SelectPrimitive.Trigger>, "value" | "defaultValue" | "onChange" | "children"> & {
  value: string | number;
  onValueChange: (value: string) => void;
  children: ReactNode;
  name?: string;
  placeholder?: string;
  size?: "sm" | "default";
};

// Encode every option so that an empty-string filter remains a selectable item.
const itemValue = (value: string | number) => `value:${value}`;

export function Select({ value, onValueChange, children, name, placeholder = "请选择", size = "default", disabled, className, onPointerDown, onKeyDown, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root value={itemValue(value)} onValueChange={(next) => onValueChange(next.slice(6))} disabled={disabled}>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <SelectPrimitive.Trigger {...props} data-slot="select-trigger" data-size={size} className={cn(styles.trigger, className)}
        onPointerDown={(event) => {
          // Pointer events still reach a button disabled by an ancestor fieldset.
          if (event.currentTarget.matches(":disabled")) event.preventDefault();
          else onPointerDown?.(event);
        }}
        onKeyDown={(event) => {
          if (event.currentTarget.matches(":disabled")) event.preventDefault();
          else onKeyDown?.(event);
        }}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className={styles.icon}><ChevronDown aria-hidden="true" /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={styles.content} position="popper" align="start" sideOffset={5} collisionPadding={12}>
          <SelectPrimitive.ScrollUpButton className={styles.scrollButton}><ChevronUp aria-hidden="true" /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className={styles.viewport}>{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className={styles.scrollButton}><ChevronDown aria-hidden="true" /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export function SelectOption({ value, children, disabled = false }: { value: string | number; children: ReactNode; disabled?: boolean }) {
  return (
    <SelectPrimitive.Item value={itemValue(value)} disabled={disabled} className={styles.option}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className={styles.indicator}><Check aria-hidden="true" /></SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
