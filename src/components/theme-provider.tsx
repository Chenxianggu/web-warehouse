"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { getServerThemeSnapshot, getThemeSnapshot, subscribeToTheme, type ResolvedTheme, type ThemePreference } from "@/lib/theme";
import { setThemeWithTransition } from "@/lib/theme-transition";

const ThemeContext = createContext({
  preference: "dark" as ThemePreference,
  resolvedTheme: "dark" as ResolvedTheme,
  setPreference: setThemeWithTransition,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [preference, resolvedTheme] = snapshot.split(":") as [ThemePreference, ResolvedTheme];
  return <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference: setThemeWithTransition }}>{children}</ThemeContext.Provider>;
}

export function useTheme() { return useContext(ThemeContext); }
