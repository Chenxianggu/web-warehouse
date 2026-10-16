import { navigation, type NavigationGroup } from "@/config/navigation";

export const ADMIN_ONLY_MENU_PATHS = new Set(["/menu-management", "/users"]);
export const configurableMenuItems = navigation
  .flatMap((group) => group.items)
  .filter((item) => item.href !== "/" && !ADMIN_ONLY_MENU_PATHS.has(item.href));
const configurablePaths = new Set(configurableMenuItems.map((item) => item.href));

export type StoredMenuPermission = { menuKey: string; isVisible: boolean };

export function isMenuAllowed(
  role: "SUPER_ADMIN" | "SALESPERSON",
  href: string,
  defaults: StoredMenuPermission[],
  customMenuKeys: string[] | null,
) {
  if (role === "SUPER_ADMIN") return true;
  if (href === "/" || href === "/settings/password") return true;
  if (!configurablePaths.has(href)) return false;
  if (customMenuKeys !== null) return customMenuKeys.includes(href);
  return defaults.find((item) => item.menuKey === href)?.isVisible !== false;
}

export function filterNavigation(
  role: "SUPER_ADMIN" | "SALESPERSON",
  defaults: StoredMenuPermission[],
  customMenuKeys: string[] | null,
): NavigationGroup[] {
  return navigation.map((group) => ({
    ...group,
    items: group.items.filter((item) => isMenuAllowed(role, item.href, defaults, customMenuKeys)),
  })).filter((group) => group.items.length > 0);
}

export function parseMenuSelection(values: FormDataEntryValue[]): string[] | null {
  if (values.some((value) => typeof value !== "string" || !configurablePaths.has(value))) return null;
  return [...new Set(values as string[])];
}
