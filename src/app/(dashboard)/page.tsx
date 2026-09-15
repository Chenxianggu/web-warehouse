import { Card, CardContent } from "@/components/ui/card";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-muted-foreground">工作台</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">首页概览</h1>
      <p className="mt-4 text-muted-foreground">欢迎使用仓库管理系统。业务模块将按方案逐步接入。</p>
      <Card className="mt-8 border-dashed bg-card/70">
        <CardContent className="py-8 text-sm text-muted-foreground">暂无业务数据或功能。</CardContent>
      </Card>
    </div>
  );
}
