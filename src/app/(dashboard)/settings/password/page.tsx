import { CircleAlert, KeyRound, LockKeyhole } from "lucide-react";
import { changePasswordAction } from "./actions";
import styles from "./password.module.css";

const errorMessages: Record<string, string> = {
  invalid: "请填写所有字段。",
  confirm: "两次输入的新密码不一致。",
  policy: "新密码不能为空，且不超过 72 字节。",
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
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>
          <KeyRound aria-hidden="true" />
          账号设置
        </p>
        <h1>修改密码</h1>
        <p className={styles.lede}>修改后当前会话将退出，请使用新密码重新登录。</p>
      </header>

      {error && (
        <p className={styles.error} role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{errorMessages[error] ?? "操作失败，请重试。"}</span>
        </p>
      )}

      <section className={styles.panel} aria-labelledby="password-panel-title">
        <div className={styles.panelHeader}>
          <span className={styles.panelIcon}>
            <LockKeyhole aria-hidden="true" />
          </span>
          <div>
            <h2 id="password-panel-title">密码信息</h2>
            <p>确认当前密码后写入新密码，保存成功会结束本次登录。</p>
          </div>
        </div>
        <form action={changePasswordAction} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="currentPassword">当前密码</label>
            <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="newPassword">新密码</label>
            <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
          </div>
          <div className={styles.field}>
            <label htmlFor="confirmPassword">确认新密码</label>
            <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
          </div>
          <div className={styles.actions}>
            <button type="submit" className={styles.submit}>保存新密码</button>
          </div>
        </form>
      </section>
    </div>
  );
}
