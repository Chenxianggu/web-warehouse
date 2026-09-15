import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardCheck,
  Gauge,
  KeyRound,
  LogOut,
  Package,
  PackageCheck,
  Repeat2,
  ScrollText,
  ShieldCheck,
  Tags,
  TriangleAlert,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";
import { signOut } from "@/auth";
import { navigation } from "@/config/navigation";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/current-user";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const navigationIcons = {
  "/": Gauge,
  "/material-categories": Tags,
  "/materials": Package,
  "/customers": Users,
  "/suppliers": Truck,
  "/warehouses": Warehouse,
  "/inbound-orders": ArrowDownToLine,
  "/outbound-orders": ArrowUpFromLine,
  "/consignments": PackageCheck,
  "/ownership-transfers": Repeat2,
  "/stock-adjustments": ClipboardCheck,
  "/stock": Boxes,
  "/stock-ledger": ScrollText,
  "/shortages": TriangleAlert,
  "/users": ShieldCheck,
} as const;

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== "/users" || user.role === UserRole.SUPER_ADMIN),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" tooltip="塑料仓库管理">
                <Link href="/">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent">
                    <Warehouse aria-hidden="true" />
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold text-sidebar-foreground">塑料仓库管理</span>
                    <span className="truncate text-xs text-sidebar-foreground/55">仓储业务系统</span>
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent className="py-2">
          {visibleNavigation.map((group) => (
            <SidebarGroup key={group.title}>
              <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const Icon = navigationIcons[item.href as keyof typeof navigationIcons] ?? Package;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild tooltip={item.label}>
                          <Link href={item.href}>
                            <Icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="修改密码">
                <Link href="/settings/password"><KeyRound aria-hidden="true" /><span>修改密码</span></Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <Button type="submit" variant="ghost" className="w-full justify-start px-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <LogOut aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">退出登录</span>
            </Button>
          </form>
          <p className="truncate px-2 pt-1 text-xs text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
            {user.username} · {user.role === UserRole.SUPER_ADMIN ? "超级管理员" : "业务员"}
          </p>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur md:px-6">
          <SidebarTrigger aria-label="展开或收起导航" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm text-muted-foreground">塑料仓库管理系统</span>
        </header>
        <div className="min-w-0 flex-1 p-6 lg:p-10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
