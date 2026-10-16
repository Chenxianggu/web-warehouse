export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "rz-theme";
const THEME_CHANGE_EVENT = "rz-theme-change";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "system" ? value : "dark";
}

// Runs in the document head before the page can paint. Keep the storage read
// guarded so privacy settings never prevent the application from loading.
export const themeBootstrapScript = `(() => {
  let preference = "dark";
  try {
    const saved = localStorage.getItem("${THEME_STORAGE_KEY}");
    if (saved === "light" || saved === "system") preference = saved;
  } catch {}
  const theme = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
  root.dataset.theme = theme;
  root.dataset.themePreference = preference;
})();`;

function applyTheme(preference: ThemePreference) {
  const resolved: ResolvedTheme = preference === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function setThemePreference(preference: ThemePreference) {
  try { localStorage.setItem(THEME_STORAGE_KEY, preference); } catch {}
  applyTheme(preference);
}

export function getThemeSnapshot(): string {
  const root = document.documentElement;
  return `${parseThemePreference(root.dataset.themePreference ?? null)}:${root.dataset.theme === "light" ? "light" : "dark"}`;
}

export function getServerThemeSnapshot() { return "dark:dark"; }

export function subscribeToTheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (document.documentElement.dataset.themePreference === "system") applyTheme("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      applyTheme(parseThemePreference(event.newValue));
    }
  };
  window.addEventListener(THEME_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", onSystemChange);
  // Another tab or the OS can change preference between the head script and
  // hydration, before these listeners exist. Reconcile that gap as well.
  try { applyTheme(parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY))); }
  catch { onSystemChange(); }
  return () => {
    window.removeEventListener(THEME_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", onSystemChange);
  };
}
