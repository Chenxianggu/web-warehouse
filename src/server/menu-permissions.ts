import { cache } from "react";
import { redirect } from "next/navigation";
import { navigation, type NavigationGroup, type NavigationItem } from "@/config/navigation";
import { UserRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { requireUser } from "@/server/current-user";

export const ADMIN_ONLY_MENU_PATHS = new Set(["/menu-management", "/users"]);

export const configurableMenuItems = navigation
  .flatMap((group) => group.items)
  .filter((item) => item.href !== "/" && !ADMIN_ONLY_MENU_PATHS.has(item.href));

const configurableMenuPaths = new Set(configurableMenuItems.map((item) => item.href));

export type MenuPermissionGroup = {
  title: string;
  items: Array<NavigationItem & { isVisible: boolean }>;
};

export const getVisibleNavigation = cache(async (role: UserRole): Promise<NavigationGroup[]> => {
  if (role === UserRole.SUPER_ADMIN) return navigation;

  const storedPermissions = await getPrisma().salespersonMenuPermission.findMany({
    where: { menuKey: { in: configurableMenuItems.map((item) => item.href) } },
    select: { menuKey: true, isVisible: true },
  });
  const visibility = new Map(storedPermissions.map((item) => [item.menuKey, item.isVisible]));

  return navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.href === "/") return true;
        if (ADMIN_ONLY_MENU_PATHS.has(item.href)) return false;
        return visibility.get(item.href) !== false;
      }),
    }))
    .filter((group) => group.items.length > 0);
});

export async function getMenuPermissionGroups(): Promise<MenuPermissionGroup[]> {
  const storedPermissions = await getPrisma().salespersonMenuPermission.findMany({
    where: { menuKey: { in: configurableMenuItems.map((item) => item.href) } },
    select: { menuKey: true, isVisible: true },
  });
  const visibility = new Map(storedPermissions.map((item) => [item.menuKey, item.isVisible]));

  return navigation
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => configurableMenuPaths.has(item.href))
        .map((item) => ({ ...item, isVisible: visibility.get(item.href) !== false })),
    }))
    .filter((group) => group.items.length > 0);
}

export async function requirePageAccess(href: string) {
  const user = await requireUser();
  if (user.role === UserRole.SUPER_ADMIN || href === "/" || href === "/settings/password") return user;
  if (ADMIN_ONLY_MENU_PATHS.has(href) || !configurableMenuPaths.has(href)) redirect("/access-denied");

  const permission = await getPrisma().salespersonMenuPermission.findUnique({
    where: { menuKey: href },
    select: { isVisible: true },
  });
  if (permission?.isVisible === false) redirect("/access-denied");
  return user;
}
