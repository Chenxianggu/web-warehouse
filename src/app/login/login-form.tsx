"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";
import styles from "./login.module.css";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={loginAction} className={styles.form}>
      <div className={styles.field}>
        <div className={styles.fieldHeader}>
          <span>01</span>
          <Label htmlFor="username">用户名</Label>
        </div>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="输入用户名"
          required
          autoFocus
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldHeader}>
          <span>02</span>
          <Label htmlFor="password">密码</Label>
        </div>
        <div className={styles.passwordField}>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="输入密码"
            required
            className={`${styles.input} ${styles.passwordInput}`}
          />
          <button
            type="button"
            className={styles.passwordToggle}
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "隐藏密码" : "显示密码"}
            aria-pressed={showPassword}
            title={showPassword ? "隐藏密码" : "显示密码"}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      </div>

      <label className={styles.rememberOption}>
        <input type="checkbox" name="remember" className={styles.rememberInput} />
        <span className={styles.rememberBox} aria-hidden="true" />
        <span className={styles.rememberCopy}>
          <strong>在此设备保持登录</strong>
          <small>勾选后 30 天内无需重复输入密码</small>
        </span>
      </label>

      <Button type="submit" size="lg" className={styles.submitButton}>
        <span>确认登录</span>
        <span className={styles.buttonCode}>ENTER_01</span>
      </Button>
    </form>
  );
}
