"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, X } from "lucide-react";
import styles from "./floating-success-message.module.css";

function clearNotice() {
  const url = new URL(window.location.href);
  url.searchParams.delete("notice");
  url.searchParams.delete("role");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function FloatingSuccessMessage({
  title,
  description,
  duration = 3500,
}: {
  title: string;
  description: string;
  duration?: number;
}) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const dismissTimer = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (dismissTimer.current !== null) return;
    setLeaving(true);
    dismissTimer.current = window.setTimeout(() => {
      setVisible(false);
      clearNotice();
    }, 180);
  }, []);

  useEffect(() => {
    const autoDismissTimer = window.setTimeout(dismiss, duration);
    return () => {
      window.clearTimeout(autoDismissTimer);
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    };
  }, [dismiss, duration]);

  if (!visible) return null;

  return (
    <div className={styles.message} data-leaving={leaving || undefined} role="status" aria-live="polite">
      <span className={styles.icon}><BadgeCheck aria-hidden="true" /></span>
      <span className={styles.copy}><strong>{title}</strong><small>{description}</small></span>
      <span className={styles.signal} aria-hidden="true" />
      <button className={styles.close} type="button" onClick={dismiss} aria-label="关闭成功提示"><X aria-hidden="true" /></button>
    </div>
  );
}
