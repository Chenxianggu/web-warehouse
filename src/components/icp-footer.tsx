import Image from "next/image";

import styles from "./icp-footer.module.css";

export function IcpFooter() {
  return (
    <footer className={styles.footer}>
      <a
        href="https://beian.miit.gov.cn/"
        target="_blank"
        rel="noopener noreferrer"
      >
        粤ICP备2026169818号
      </a>
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=44051502000780"
        target="_blank"
        rel="noopener noreferrer"
      >
        <Image src="/brand/psb-filing.png" alt="" width={14} height={15} unoptimized />
        粤公网安备44051502000780号
      </a>
    </footer>
  );
}
