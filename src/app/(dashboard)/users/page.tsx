import { Activity, CircleAlert, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { UserRole } from "@/generated/prisma/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CreateUserDialog } from "@/components/create-user-dialog";
import { FloatingSuccessMessage } from "@/components/floating-success-message";
import { ResetPasswordButton } from "@/components/user-form-buttons";
import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";
import { resetUserPasswordAction } from "./actions";
import styles from "./users.module.css";

const messages: Record<string, string> = {
  username: "用户名需为 3–50 位小写字母、数字、点、下划线或连字符。",
  password: "密码至少需要 12 个字符，且不能超过 72 字节。",
  role: "请选择一个有效的账号角色。",
  duplicate: "该用户名已经存在，请更换后重试。",
  missing: "目标账号不存在或已被删除。",
  "self-reset": "当前账号请通过侧栏的“修改密码”入口更新密码。",
};

const roleLabel: Record<UserRole, string> = {
  [UserRole.SUPER_ADMIN]: "超级管理员",
  [UserRole.SALESPERSON]: "普通业务员",
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; role?: string }> }) {
  const currentUser = await requireAdmin();
  const [query, users] = await Promise.all([
    searchParams,
    getPrisma().user.findMany({
      select: { id: true, username: true, role: true, isActive: true, createdAt: true },
      orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  const adminCount = users.filter((user) => user.role === UserRole.SUPER_ADMIN).length;
  const salespersonCount = users.length - adminCount;
  const createError = query.error && ["username", "password", "role", "duplicate"].includes(query.error) ? messages[query.error] : undefined;
  const pageError = query.error && !createError ? messages[query.error] : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}><UserCog aria-hidden="true" />账号控制</p>
          <h1>用户管理</h1>
          <p>创建系统账号并赋予角色。系统支持多个超级管理员。</p>
        </div>
        <div className={styles.heroActions}>
          <div className={styles.liveBadge}><span />身份服务在线</div>
          <CreateUserDialog errorMessage={createError} />
        </div>
      </header>

      {pageError && <Alert variant="destructive" className={styles.alert}><CircleAlert aria-hidden="true" /><AlertDescription>{pageError}</AlertDescription></Alert>}
      {query.notice === "created" && <FloatingSuccessMessage title="账号创建成功" description={`已创建${query.role === UserRole.SUPER_ADMIN ? "超级管理员" : "普通业务员"}账号`} />}
      {query.notice === "reset" && <FloatingSuccessMessage title="密码重置成功" description="新密码已生效，该账号的旧会话已失效" />}

      <section className={styles.directory} aria-labelledby="account-directory-heading">
        <div className={styles.directoryHeader}>
          <div><h2 id="account-directory-heading">账号目录</h2><p>查看角色状态，并为其他账号设置新的登录密码。</p></div>
          <div className={styles.counts} aria-label={`共 ${users.length} 个账号`}>
            <span><strong>{users.length}</strong>全部账号</span><span><strong>{adminCount}</strong>超级管理员</span><span><strong>{salespersonCount}</strong>普通业务员</span>
          </div>
        </div>
        {users.length === 0 ? <div className={styles.emptyState}>暂无系统账号。</div> : (
          <div className={styles.userList}>
            {users.map((user) => {
              const isCurrentUser = user.id === currentUser.id;
              return (
                <article className={styles.userRow} key={user.id}>
                  <div className={styles.identity}>
                    <span className={styles.avatar} data-admin={user.role === UserRole.SUPER_ADMIN || undefined}>{user.username.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{user.username}</strong><small>创建于 {user.createdAt.toLocaleDateString("zh-CN")}{isCurrentUser ? " · 当前账号" : ""}</small></span>
                  </div>
                  <div className={styles.accountState}>
                    <span className={styles.roleBadge} data-admin={user.role === UserRole.SUPER_ADMIN || undefined}><ShieldCheck aria-hidden="true" />{roleLabel[user.role]}</span>
                    <span className={styles.statusBadge} data-active={user.isActive || undefined}><Activity aria-hidden="true" />{user.isActive ? "启用中" : "已停用"}</span>
                  </div>
                  {isCurrentUser ? <div className={styles.selfNotice}><KeyRound aria-hidden="true" /><span>请从侧栏“修改密码”更新当前账号</span></div> : (
                    <form action={resetUserPasswordAction} className={styles.resetForm}>
                      <input type="hidden" name="userId" value={user.id} />
                      <label className={styles.srOnly} htmlFor={`password-${user.id}`}>为 {user.username} 设置新密码</label>
                      <input id={`password-${user.id}`} name="password" type="password" placeholder="输入新密码（至少 12 位）" autoComplete="new-password" required minLength={12} />
                      <ResetPasswordButton />
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
