import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";
import { createSalespersonAction, resetSalespersonPasswordAction } from "./actions";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const messages: Record<string, string> = {
  username: "用户名需为 3–50 位小写字母、数字、点、下划线或连字符。",
  password: "密码至少 12 个字符，且不超过 72 字节。",
  duplicate: "用户名已存在。",
  missing: "业务员账号不存在。",
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const users = await getPrisma().user.findMany({
    where: { role: "SALESPERSON" },
    select: { id: true, username: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-muted-foreground">系统管理</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">用户与权限</h1>
      <p className="mt-3 text-sm text-muted-foreground">系统仅有超级管理员和业务员两个角色。新建的账号固定为业务员。</p>

      {query.error && (
        <Alert variant="destructive" className="mt-6">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{messages[query.error] ?? "操作失败，请重试。"}</AlertDescription>
        </Alert>
      )}
      {query.notice && (
        <Alert className="mt-6 border-emerald-900/80 bg-emerald-950/30 text-emerald-300">
          <AlertDescription className="text-emerald-300">{query.notice === "created" ? "业务员账号已创建。" : "密码已重置，旧会话已失效。"}</AlertDescription>
        </Alert>
      )}

      <Card className="mt-8">
        <CardHeader><CardTitle>新增业务员</CardTitle></CardHeader>
        <CardContent>
          <form action={createSalespersonAction} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="newUsername">用户名</Label>
              <Input id="newUsername" name="username" type="text" autoComplete="off" required minLength={3} maxLength={50} className="h-10 bg-muted/60" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newUserPassword">初始密码</Label>
              <Input id="newUserPassword" name="password" type="password" autoComplete="new-password" required minLength={12} className="h-10 bg-muted/60" />
            </div>
            <Button type="submit" size="lg">创建账号</Button>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-8">
        <CardHeader><CardTitle>业务员账号</CardTitle></CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无业务员账号。</p>
          ) : (
          <div className="space-y-5">
            {users.map((user, index) => (
              <div key={user.id}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                  <p className="font-medium">{user.username}</p>
                    <p className="text-xs text-muted-foreground">{user.isActive ? "启用中" : "已停用"} · 创建于 {user.createdAt.toLocaleDateString("zh-CN")}</p>
                  </div>
                  <form action={resetSalespersonPasswordAction} className="flex flex-col gap-2 sm:flex-row">
                    <Input type="hidden" name="userId" value={user.id} />
                    <Input name="password" type="password" aria-label={`为 ${user.username} 设置新密码`} placeholder="新密码（至少 12 位）" autoComplete="new-password" required minLength={12} className="h-9 bg-muted/60 sm:w-56" />
                    <Button type="submit" variant="outline">重置密码</Button>
                  </form>
                </div>
                {index < users.length - 1 && <Separator className="mt-5" />}
              </div>
            ))}
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
