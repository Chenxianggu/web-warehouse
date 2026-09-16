"use client";

import { useRef } from "react";
import { Dialog } from "radix-ui";
import { ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateUserButton } from "@/components/user-form-buttons";
import { createUserAction } from "@/app/(dashboard)/users/actions";
import styles from "@/app/(dashboard)/users/users.module.css";

export function CreateUserDialog({ errorMessage }: { errorMessage?: string }) {
  const usernameInput = useRef<HTMLInputElement>(null);

  return (
    <Dialog.Root defaultOpen={Boolean(errorMessage)}>
      <Dialog.Trigger asChild>
        <Button className={styles.openDialogButton} type="button"><UserPlus aria-hidden="true" />创建用户</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.dialogOverlay} />
        <Dialog.Content
          className={styles.dialogContent}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            usernameInput.current?.focus();
          }}
        >
          <header className={styles.dialogHeader}>
            <span className={styles.panelIcon}><UsersRound aria-hidden="true" /></span>
            <div>
              <Dialog.Title>创建系统账号</Dialog.Title>
              <Dialog.Description>设置登录凭据，并为新用户分配系统角色。</Dialog.Description>
            </div>
            <Dialog.Close className={styles.dialogClose} aria-label="关闭创建用户弹窗"><X aria-hidden="true" /></Dialog.Close>
          </header>

          {errorMessage && <div className={styles.dialogError} role="alert">{errorMessage}</div>}

          <form action={createUserAction} className={styles.createForm}>
            <div className={styles.field}>
              <label htmlFor="newUsername">用户名</label>
              <input ref={usernameInput} id="newUsername" name="username" type="text" autoComplete="off" required minLength={3} maxLength={50} pattern="[a-zA-Z0-9._-]+" placeholder="例如：sales.lin" />
              <small>3–50 位，可使用字母、数字、点、下划线和连字符</small>
            </div>
            <div className={styles.field}>
              <label htmlFor="newUserPassword">初始密码</label>
              <input id="newUserPassword" name="password" type="password" autoComplete="new-password" required minLength={12} placeholder="至少 12 个字符" />
              <small>创建后，用户可在登录后自行修改</small>
            </div>
            <fieldset className={styles.roleFieldset}>
              <legend>账号角色</legend>
              <label className={styles.roleOption}>
                <input name="role" type="radio" value="SALESPERSON" defaultChecked />
                <span className={styles.roleMarker} aria-hidden="true" />
                <span><strong>普通业务员</strong><small>使用菜单管理中配置的统一业务权限</small></span>
              </label>
              <label className={styles.roleOption}>
                <input name="role" type="radio" value="SUPER_ADMIN" />
                <span className={styles.roleMarker} aria-hidden="true" />
                <span><strong>超级管理员</strong><small>拥有所有页面及系统配置权限</small></span>
              </label>
            </fieldset>
            <div className={styles.createNote}><ShieldCheck aria-hidden="true" />超级管理员可创建其他超级管理员。</div>
            <footer className={styles.dialogFooter}>
              <Dialog.Close asChild><Button className={styles.cancelButton} type="button" variant="outline">取消</Button></Dialog.Close>
              <CreateUserButton />
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
