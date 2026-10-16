"use client";

import { flushSync } from "react-dom";
import { setThemePreference, type ThemePreference } from "@/lib/theme";

let activeTransition: ViewTransition | undefined;
let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;

export function setThemeWithTransition(preference: ThemePreference) {
  const root = document.documentElement;
  const current = ++generation;
  // A skipped snapshot still runs its update callback. Only the latest request
  // may commit, so rapid clicks cannot restore an outdated theme afterwards.
  activeTransition?.skipTransition();
  activeTransition = undefined;
  clearTimeout(cleanupTimer);
  delete root.dataset.themeTransition;

  const commit = () => {
    if (current === generation) flushSync(() => setThemePreference(preference));
  };
  const cleanup = () => {
    if (current !== generation) return;
    delete root.dataset.themeTransition;
    activeTransition = undefined;
    cleanupTimer = undefined;
  };
  const resolved = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;

  if (resolved === root.dataset.theme || document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }

  if (typeof document.startViewTransition === "function") {
    root.dataset.themeTransition = "snapshot";
    try {
      const transition = document.startViewTransition(commit);
      activeTransition = transition;
      // Skipping a transition rejects ready even though its update still runs.
      void transition.ready.catch(() => undefined);
      void transition.finished.then(cleanup, cleanup);
      return;
    } catch {
      // Keep the color transition usable when snapshot capture is unavailable.
      delete root.dataset.themeTransition;
    }
  }

  root.dataset.themeTransition = "colors";
  // Establish the old computed colors with transitions enabled before changing
  // the variables; otherwise browsers can coalesce both changes into one paint.
  void root.offsetWidth;
  commit();
  cleanupTimer = setTimeout(cleanup, 450);
}
