import type { CSSProperties } from "react";
import Link from "next/link";
import { KeyRound, LogOut, Warehouse } from "lucide-react";
import { signOut } from "@/auth";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/current-user";
import { getVisibleNavigation } from "@/server/menu-permissions";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import styles from "./dashboard-shell.module.css";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const visibleNavigation = await getVisibleNavigation(user.role);

  return (
    <SidebarProvider className={styles.shell} style={{ "--sidebar-width": "17rem" } as CSSProperties}>
      <Sidebar className={styles.sidebarFrame} collapsible="icon">
        <SidebarHeader className={styles.brandHeader}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className={styles.brandLink} size="lg" tooltip="仁众塑料">
                <Link href="/">
                  <span className={styles.brandMark}>
                    <Warehouse aria-hidden="true" />
                  </span>
                  <span className={styles.brandCopy}>
                    <strong>任仲塑料</strong>
                    <small>WAREHOUSE CONTROL</small>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className={styles.sidebarContent}>
          <DashboardNavigation groups={visibleNavigation} />
        </SidebarContent>

        <SidebarFooter className={styles.sidebarFooter}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className={styles.footerAction} tooltip="修改密码">
                <Link href="/settings/password"><KeyRound aria-hidden="true" /><span>修改密码</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <Button type="submit" variant="ghost" className={`${styles.footerAction} w-full justify-start px-2`}>
              <LogOut aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">退出登录</span>
            </Button>
          </form>
          <p className={`${styles.userReadout} group-data-[collapsible=icon]:hidden`}>
            <span className="truncate">{user.username} · {user.role === UserRole.SUPER_ADMIN ? "超级管理员" : "业务员"}</span>
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className={styles.topbar}>
          <SidebarTrigger className={styles.topbarTrigger} aria-label="展开或收起导航" />
          <Separator orientation="vertical" className="h-4 bg-[rgb(201_169_110_/_20%)]" />
          <span className={styles.topbarTitle}>塑料仓储业务系统</span>
          <span className={styles.topbarStatus}>SYSTEM ONLINE</span>
        </header>
        <div className="min-w-0 flex-1 p-6 lg:p-10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
