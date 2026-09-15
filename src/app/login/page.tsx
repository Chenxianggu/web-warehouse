import { loginAction } from "./actions";
import { CircleAlert, PackageOpen } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const query = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md border-border/80 bg-card shadow-2xl shadow-black">
        <CardHeader className="gap-3 px-7 pt-3 sm:px-9">
          <div className="mb-3 flex size-11 items-center justify-center rounded-lg border bg-muted">
            <PackageOpen className="size-5" aria-hidden="true" />
          </div>
          <CardDescription className="font-medium text-foreground/70">塑料仓库管理系统</CardDescription>
          <CardTitle className="text-3xl font-semibold tracking-tight">登录</CardTitle>
          <CardDescription>请输入账号信息进入管理后台。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 px-7 pb-5 sm:px-9">
          {query.error && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>用户名或密码不正确，或账号已停用。</AlertDescription>
            </Alert>
          )}
          {query.changed && (
            <Alert className="border-emerald-900/80 bg-emerald-950/30 text-emerald-300">
              <AlertDescription className="text-emerald-300">密码已修改，请重新登录。</AlertDescription>
            </Alert>
          )}
          <form action={loginAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <Input id="username" name="username" type="text" autoComplete="username" required autoFocus className="h-10 bg-muted/60" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10 bg-muted/60" />
            </div>
            <Button type="submit" size="lg" className="w-full">登录</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
