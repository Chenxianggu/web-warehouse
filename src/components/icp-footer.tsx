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
    </footer>
  );
}
