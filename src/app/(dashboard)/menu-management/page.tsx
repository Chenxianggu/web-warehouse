import { CircleAlert, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { MenuPermissionsForm } from "@/components/menu-permissions-form";
import { MenuSuccessMessage } from "@/components/menu-success-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getMenuPermissionGroups } from "@/server/menu-permissions";
import { requireAdmin } from "@/server/current-user";
import styles from "./menu-management.module.css";

export default async function MenuManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  await requireAdmin();
  const [groups, query] = await Promise.all([getMenuPermissionGroups(), searchParams]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><ShieldCheck aria-hidden="true" />权限控制</p>
          <h1>菜单管理</h1>
          <p>配置全体业务员可以查看和访问的业务页面。</p>
        </div>
        <div className={styles.scopeBadge}><span />全局业务员配置</div>
      </header>

      {query.error && (
        <Alert variant="destructive" className={styles.alert}>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>提交的菜单权限无效，请刷新页面后重试。</AlertDescription>
        </Alert>
      )}
      {query.notice === "saved" && (
        <MenuSuccessMessage />
      )}

      <section className={styles.fixedRules} aria-labelledby="fixed-rules-heading">
        <div className={styles.fixedHeading}>
          <LockKeyhole aria-hidden="true" />
          <div><h2 id="fixed-rules-heading">固定访问规则</h2><p>这些入口由系统锁定，不参与下方配置。</p></div>
        </div>
        <div className={styles.ruleGrid}>
          <div><KeyRound aria-hidden="true" /><span><strong>始终开放</strong><small>首页、修改密码</small></span></div>
          <div><ShieldCheck aria-hidden="true" /><span><strong>仅超级管理员</strong><small>菜单管理、用户管理</small></span></div>
        </div>
      </section>

      <MenuPermissionsForm groups={groups} />
    </div>
  );
}
