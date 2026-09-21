"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./page-transition.module.css";

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (previousPathname.current === pathname) return;

    previousPathname.current = pathname;
    setSwitching(true);

    const timeoutId = window.setTimeout(() => setSwitching(false), 780);
    return () => window.clearTimeout(timeoutId);
  }, [pathname]);

  return (
    <div className={`${styles.frame} ${switching ? styles.switching : ""}`}>
      <div key={pathname} className={styles.page}>
        {children}
      </div>
      <div className={styles.scan} aria-hidden="true" />
    </div>
  );
}
