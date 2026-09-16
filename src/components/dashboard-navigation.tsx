"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavigationGroup } from "@/config/navigation";
import { getNavigationIcon } from "@/config/navigation-icons";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import styles from "@/app/(dashboard)/dashboard-shell.module.css";

export function DashboardNavigation({ groups }: { groups: NavigationGroup[] }) {
  const pathname = usePathname();

  return groups.map((group) => (
    <SidebarGroup className={styles.navigationGroup} key={group.title}>
      <SidebarGroupLabel className={styles.groupLabel}>{group.title}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className={styles.navigationList}>
          {group.items.map((item) => {
            const Icon = getNavigationIcon(item.href);
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  className={styles.navigationItem}
                  isActive={isActive}
                  tooltip={item.label}
                >
                  <Link href={item.href} aria-current={isActive ? "page" : undefined}>
                    <span className={styles.iconCell}>
                      <Icon aria-hidden="true" />
                    </span>
                    <span>{item.label}</span>
                    <span aria-hidden="true" className={styles.activeSignal} />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  ));
}
