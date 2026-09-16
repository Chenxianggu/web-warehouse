import Link from "next/link";
import { ArrowUpRight, Radio } from "lucide-react";
import type { NavigationGroup } from "@/config/navigation";
import { getNavigationIcon } from "@/config/navigation-icons";
import styles from "@/app/(dashboard)/home.module.css";

export function HomeWorkbench({ groups, username }: { groups: NavigationGroup[]; username: string }) {
  const moduleCount = groups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.statusLine}><Radio aria-hidden="true" />业务入口已连接</p>
          <h1>业务工作台</h1>
          <p className={styles.introduction}>从这里进入库存、客户、订单及系统功能。</p>
        </div>
        <dl className={styles.readout}>
          <div><dt>当前用户</dt><dd>{username}</dd></div>
          <div><dt>可用入口</dt><dd>{moduleCount}</dd></div>
        </dl>
      </header>

      <div className={styles.sections}>
        {groups.map((group) => (
          <section className={styles.section} key={group.title} aria-labelledby={`group-${group.title}`}>
            <div className={styles.sectionHeading}>
              <h2 id={`group-${group.title}`}>{group.title}</h2>
              <span>{group.items.length} 项功能</span>
            </div>
            <div className={styles.moduleGrid}>
              {group.items.map((item) => {
                const Icon = getNavigationIcon(item.href);
                const isCurrent = item.href === "/";

                return (
                  <Link className={styles.moduleCard} data-current={isCurrent || undefined} href={item.href} key={item.href}>
                    <span className={styles.moduleIcon}><Icon aria-hidden="true" /></span>
                    <span className={styles.moduleCopy}>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                    {isCurrent ? (
                      <span className={styles.currentTag}>当前</span>
                    ) : (
                      <ArrowUpRight aria-hidden="true" className={styles.moduleArrow} />
                    )}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
