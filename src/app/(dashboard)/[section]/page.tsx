import { notFound } from "next/navigation";
import { modulePages } from "@/config/navigation";
import { Card, CardContent } from "@/components/ui/card";

export function generateStaticParams() {
  return modulePages.map((page) => ({ section: page.href.slice(1) }));
}

export default async function ModulePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const page = modulePages.find((item) => item.href === `/${section}`);

  if (!page) notFound();

  return (
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-medium text-muted-foreground">模块占位页</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{page.label}</h1>
      <Card className="mt-8 border-dashed bg-card/70">
        <CardContent className="py-8 text-sm text-muted-foreground">此模块尚未实现。</CardContent>
      </Card>
    </div>
  );
}
