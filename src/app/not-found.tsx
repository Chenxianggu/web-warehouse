import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">页面不存在</CardTitle>
        </CardHeader>
        <CardContent>
          <Button asChild><Link href="/">返回首页</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
