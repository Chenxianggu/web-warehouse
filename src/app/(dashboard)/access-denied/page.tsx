import Link from "next/link";
import { ArrowLeft, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "./access-denied.module.css";

export default function AccessDeniedPage() {
  return (
    <div className={styles.page}>
      <div className={styles.signal}><span>403</span><ShieldX aria-hidden="true" /></div>
      <p className={styles.status}>访问被权限策略阻止</p>
      <h1>你没有查看此页面的权限</h1>
      <p className={styles.description}>如需使用此功能，请联系超级管理员在菜单管理中开放对应页面。</p>
      <Button asChild className={styles.backButton}>
        <Link href="/"><ArrowLeft aria-hidden="true" />返回业务工作台</Link>
      </Button>
    </div>
  );
}
