"use client";

import { useRef, type ComponentProps } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "cn";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import styles from "./number-input.module.css";

type NumberInputProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "ref" | "min" | "max" | "step"
> & {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

export function NumberInput({
  value,
  onValueChange,
  label,
  min,
  max,
  step = 1,
  suffix,
  className,
  disabled,
  readOnly,
  inputMode = step < 1 ? "decimal" : "numeric",
  ...props
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const numericValue = value === "" ? null : Number(value);
  const inactive = disabled || readOnly;
  const atMinimum = numericValue !== null && min !== undefined && numericValue <= min;
  const atMaximum = numericValue !== null && max !== undefined && numericValue >= max;

  const changeByStep = (direction: "up" | "down") => {
    const input = inputRef.current;
    if (!input || inactive) return;
    // Use the browser's decimal-safe stepping and native min/max/step rules.
    if (direction === "up") input.stepUp();
    else input.stepDown();
    onValueChange(input.value);
  };

  return (
    <InputGroup className={cn(styles.group, className)} aria-label={label} data-disabled={disabled || undefined}>
      <InputGroupInput
        {...props}
        ref={inputRef}
        className={styles.input}
        type="number"
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      />
      <InputGroupAddon align="inline-end" className={styles.controls}>
        {suffix && <InputGroupText className={styles.unit}>{suffix}</InputGroupText>}
        <InputGroupButton
          size="icon-sm"
          className={styles.stepButton}
          aria-label={`减少${label}`}
          aria-controls={props.id}
          disabled={inactive || atMinimum}
          onClick={() => changeByStep("down")}
        >
          <Minus aria-hidden="true" />
        </InputGroupButton>
        <InputGroupButton
          size="icon-sm"
          className={styles.stepButton}
          aria-label={`增加${label}`}
          aria-controls={props.id}
          disabled={inactive || atMaximum}
          onClick={() => changeByStep("up")}
        >
          <Plus aria-hidden="true" />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
