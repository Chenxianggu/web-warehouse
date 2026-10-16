import { cache } from "react";
import { redirect } from "next/navigation";
import { navigation, type NavigationGroup, type NavigationItem } from "@/config/navigation";
import { UserRole } from "@/generated/prisma/client";
import { configurableMenuItems, filterNavigation, isMenuAllowed } from "@/features/identity/menu-permissions";
import { getPrisma } from "@/server/db";
import { requireUser } from "@/server/current-user";
import { writeLog } from "@/server/logger";

export { ADMIN_ONLY_MENU_PATHS, configurableMenuItems } from "@/features/identity/menu-permissions";

export type MenuPermissionGroup = {
  title: string;
  items: Array<NavigationItem & { isVisible: boolean }>;
};

// Request-local only: permission edits are read again on the next request.
const getPermissionConfig = cache(async (userId?: string) => {
  const db = getPrisma();
  const [defaults, custom] = await Promise.all([
    db.salespersonMenuPermission.findMany({ select: { menuKey: true, isVisible: true } }),
    userId ? db.userMenuPermission.findUnique({ where: { userId }, select: { menuKeys: true } }) : null,
  ]);
  return { defaults, customMenuKeys: custom?.menuKeys ?? null };
});

export const getVisibleNavigation = cache(async (userId: string, role: UserRole): Promise<NavigationGroup[]> => {
  if (role === UserRole.SUPER_ADMIN) return navigation;
  const { defaults, customMenuKeys } = await getPermissionConfig(userId);
  return filterNavigation(role, defaults, customMenuKeys);
});

export async function getMenuPermissionGroups(userId?: string) {
  const { defaults, customMenuKeys } = await getPermissionConfig(userId);
  const configurablePaths = new Set(configurableMenuItems.map((item) => item.href));
  const groups: MenuPermissionGroup[] = navigation.map((group) => ({
    title: group.title,
    items: group.items.filter((item) => configurablePaths.has(item.href)).map((item) => ({
      ...item,
      isVisible: isMenuAllowed(UserRole.SALESPERSON, item.href, defaults, customMenuKeys),
    })),
  })).filter((group) => group.items.length > 0);
  return { groups, isCustom: customMenuKeys !== null };
}

export async function requirePageAccess(href: string) {
  const user = await requireUser();
  if (user.role === UserRole.SUPER_ADMIN || href === "/" || href === "/settings/password") return user;
  const { defaults, customMenuKeys } = await getPermissionConfig(user.id);
  if (!isMenuAllowed(user.role, href, defaults, customMenuKeys)) {
    await writeLog({ category: "AUTH", level: "WARN", status: "FAILURE", module: "访问控制", action: "ACCESS_DENIED", message: "页面访问被菜单权限拒绝", actor: user, metadata: { path: href } });
    redirect("/access-denied");
  }
  return user;
}
