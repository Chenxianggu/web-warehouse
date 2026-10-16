"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import styles from "./theme-switcher.module.css";

export function ThemeSwitcher() {
  const { resolvedTheme, setPreference } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const Icon = nextTheme === "light" ? Sun : Moon;
  return <button
    type="button"
    className={styles.control}
    aria-label={nextTheme === "light" ? "切换为浅色主题" : "切换为深色主题"}
    onClick={() => setPreference(nextTheme)}
  >
    <Icon aria-hidden="true" />
  </button>;
}
