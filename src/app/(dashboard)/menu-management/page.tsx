import { CircleAlert, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { MenuPermissionsEditor } from "@/components/menu-permissions-editor";
import { MenuSuccessMessage } from "@/components/menu-success-message";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UserRole } from "@/generated/prisma/client";
import { getMenuPermissionGroups } from "@/server/menu-permissions";
import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";
import styles from "./menu-management.module.css";

export default async function MenuManagementPage({ searchParams }: {
  searchParams: Promise<{ error?: string; notice?: string; userId?: string }>;
}) {
  await requireAdmin();
  const [users, query] = await Promise.all([
    getPrisma().user.findMany({
      where: { role: UserRole.SALESPERSON },
      select: { id: true, username: true, isActive: true, menuPermission: { select: { userId: true } } },
      orderBy: { username: "asc" },
    }),
    searchParams,
  ]);
  const targetUser = query.userId ? users.find((user) => user.id === query.userId) : undefined;
  const invalidTarget = Boolean(query.userId && !targetUser);
  const { groups, isCustom } = await getMenuPermissionGroups(targetUser?.id);
  const subject = targetUser ? targetUser.username : "默认业务员";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><ShieldCheck aria-hidden="true" />权限控制</p>
          <h1>菜单管理</h1>
          <p>设置业务员默认菜单，也可为指定用户单独配置。</p>
        </div>
        <div className={styles.scopeBadge}><span />{targetUser ? "指定用户配置" : "全局默认配置"}</div>
      </header>

      {(query.error || invalidTarget) && (
        <Alert variant="destructive" className={styles.alert}>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{invalidTarget || query.error === "target" ? "目标业务员不存在或角色已变更，请重新选择用户。" : "提交的菜单权限无效，请刷新页面后重试。"}</AlertDescription>
        </Alert>
      )}
      {!invalidTarget && ["saved", "inherited"].includes(query.notice ?? "") && (
        <MenuSuccessMessage description={query.notice === "inherited" ? `${subject} 已恢复使用默认权限` : targetUser ? `${subject} 的专属菜单权限已生效` : "默认权限已更新，使用单独配置的用户不受影响"} />
      )}

      <MenuPermissionsEditor
        users={users.map((user) => ({ id: user.id, username: user.username, isActive: user.isActive, hasCustomPermissions: user.menuPermission !== null }))}
        userId={targetUser?.id}
        groups={groups}
        isCustom={isCustom}
        invalidTarget={invalidTarget}
      >
        <section className={styles.fixedRules} aria-labelledby="fixed-rules-heading">
          <div className={styles.fixedHeading}>
            <LockKeyhole aria-hidden="true" />
            <div><h2 id="fixed-rules-heading">固定访问规则</h2><p>超级管理员始终拥有全部权限，不参与配置。</p></div>
          </div>
          <div className={styles.ruleGrid}>
            <div><KeyRound aria-hidden="true" /><span><strong>始终开放</strong><small>首页、修改密码</small></span></div>
            <div><ShieldCheck aria-hidden="true" /><span><strong>仅超级管理员</strong><small>菜单管理、用户管理</small></span></div>
          </div>
        </section>
      </MenuPermissionsEditor>
    </div>
  );
}
