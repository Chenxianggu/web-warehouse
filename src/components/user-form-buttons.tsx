"use client";

import { useFormStatus } from "react-dom";
import { KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import styles from "@/app/(dashboard)/users/users.module.css";

export function CreateUserButton() {
  const { pending } = useFormStatus();
  return <Button className={styles.createButton} disabled={pending} type="submit"><UserPlus aria-hidden="true" />{pending ? "正在创建" : "创建账号"}</Button>;
}

export function ResetPasswordButton() {
  const { pending } = useFormStatus();
  return <Button className={styles.resetButton} disabled={pending} type="submit" variant="outline"><KeyRound aria-hidden="true" />{pending ? "重置中" : "重置密码"}</Button>;
}
