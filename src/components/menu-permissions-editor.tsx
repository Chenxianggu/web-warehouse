"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MenuPermissionGroup } from "@/server/menu-permissions";
import { MenuPermissionsForm } from "@/components/menu-permissions-form";
import styles from "@/app/(dashboard)/menu-management/menu-management.module.css";

type PermissionUser = { id: string; username: string; isActive: boolean; hasCustomPermissions: boolean };

export function MenuPermissionsEditor({ users, userId, groups, isCustom, invalidTarget, children }: {
  users: PermissionUser[];
  userId?: string;
  groups: MenuPermissionGroup[];
  isCustom: boolean;
  invalidTarget: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targetUser = users.find((user) => user.id === userId);

  function changeUser(nextUserId: string) {
    const href = nextUserId ? `/menu-management?userId=${encodeURIComponent(nextUserId)}` : "/menu-management";
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <fieldset className={styles.editor} disabled={pending} aria-busy={pending} aria-label="菜单权限配置">
      <section className={styles.scopePanel} aria-labelledby="scope-heading">
        <div>
          <h2 id="scope-heading">配置对象</h2>
          <p>选择后自动加载对应权限，勾选菜单后保存。</p>
        </div>
        <div className={styles.scopeForm}>
          <label htmlFor="permission-user">选择配置对象</label>
          <select id="permission-user" value={targetUser?.id ?? ""} onChange={(event) => changeUser(event.target.value)} aria-describedby="permission-scope-status">
            <option value="">全体业务员 · 默认权限</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.username} · {user.hasCustomPermissions ? "单独配置" : "跟随默认"}{!user.isActive ? " · 已停用" : ""}</option>)}
          </select>
        </div>
        <p className={styles.scopeHint} id="permission-scope-status" role="status">
          {pending ? "正在切换配置对象，请稍候…" : invalidTarget ? "请选择有效的配置对象。" : targetUser ? <>
            当前编辑：<strong>{targetUser.username}</strong> · {isCustom ? "已使用单独配置，不随默认权限变更" : "正在跟随默认权限，保存后将改为单独配置"}
          </> : "当前编辑默认权限：保存后仅影响仍在跟随默认配置的业务员。"}
        </p>
      </section>

      {children}

      {!invalidTarget && <MenuPermissionsForm key={`${userId ?? "default"}:${isCustom}:${JSON.stringify(groups)}`} groups={groups} userId={userId} username={targetUser?.username} isCustom={isCustom} />}
    </fieldset>
  );
}
