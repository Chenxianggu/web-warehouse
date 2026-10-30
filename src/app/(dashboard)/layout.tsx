import type { CSSProperties } from "react";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/current-user";
import { getVisibleNavigation } from "@/server/menu-permissions";
import { DashboardNavigation } from "@/components/dashboard-navigation";
import { PageTransition } from "@/components/page-transition";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { BrandLogo } from "@/components/brand-logo";
import { IcpFooter } from "@/components/icp-footer";
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
  const visibleNavigation = await getVisibleNavigation(user.id, user.role);

  return (
    <SidebarProvider className={styles.shell} style={{ "--sidebar-width": "var(--rz-sidebar-width)" } as CSSProperties}>
      <Sidebar className={styles.sidebarFrame} collapsible="icon">
        <SidebarHeader className={styles.brandHeader}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className={styles.brandLink} size="lg" tooltip="任仲塑料">
                <Link href="/" aria-label="任仲塑料首页">
                  <span className={styles.brandMark}>
                    <BrandLogo />
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

      <SidebarInset className={styles.main}>
        <header className={styles.topbar}>
          <SidebarTrigger className={styles.topbarTrigger} aria-label="展开或收起导航" />
          <Separator orientation="vertical" className="h-4 bg-[var(--rz-edge)]" />
          <span className={styles.topbarTitle}>塑料仓储业务系统</span>
          <span className={styles.topbarStatus}>SYSTEM ONLINE</span>
          <ThemeSwitcher />
        </header>
        <div className={styles.content}>
          <PageTransition>{children}</PageTransition>
        </div>
        <IcpFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
