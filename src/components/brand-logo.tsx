import Image from "next/image";
import styles from "./brand-logo.module.css";

/** Decorative mark; the surrounding brand text or link supplies its name. */
export function BrandLogo() {
  return (
    <Image
      src="/brand/rz-polymer-logo-ui.png"
      alt=""
      aria-hidden="true"
      width={256}
      height={256}
      sizes="48px"
      loading="eager"
      className={styles.logo}
    />
  );
}
