import { changePasswordAction } from "./actions";
import { CircleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const errorMessages: Record<string, string> = {
  invalid: "请填写所有字段。",
  confirm: "两次输入的新密码不一致。",
  policy: "新密码至少 12 个字符，且不超过 72 字节。",
  same: "新密码不能与当前密码相同。",
  current: "当前密码不正确。",
  retry: "密码已被更新，请刷新页面后重试。",
};

export default async function PasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm font-medium text-muted-foreground">账号设置</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">修改密码</h1>
      <p className="mt-3 text-sm text-muted-foreground">修改后当前会话将退出，请使用新密码重新登录。</p>
      {error && (
        <Alert variant="destructive" className="mt-6">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{errorMessages[error] ?? "操作失败，请重试。"}</AlertDescription>
        </Alert>
      )}
      <Card className="mt-7">
        <CardHeader><CardTitle>密码信息</CardTitle></CardHeader>
        <CardContent>
          <form action={changePasswordAction} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">当前密码</Label>
              <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className="h-10 bg-muted/60" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">新密码</Label>
              <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} required className="h-10 bg-muted/60" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认新密码</Label>
              <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required className="h-10 bg-muted/60" />
            </div>
            <Button type="submit" size="lg">保存新密码</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
