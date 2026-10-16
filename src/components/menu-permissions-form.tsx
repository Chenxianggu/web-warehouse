"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Check, Eye, EyeOff, RotateCcw, Save } from "lucide-react";
import type { MenuPermissionGroup } from "@/server/menu-permissions";
import { getNavigationIcon } from "@/config/navigation-icons";
import { Button } from "@/components/ui/button";
import { updateMenuPermissionsAction } from "@/app/(dashboard)/menu-management/actions";
import styles from "@/app/(dashboard)/menu-management/menu-management.module.css";

function PermissionFields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset className={styles.permissionFields} disabled={pending}>{children}</fieldset>;
}

function SaveButtons({ userId, isCustom }: { userId?: string; isCustom: boolean }) {
  const { pending } = useFormStatus();

  return (
    <div className={styles.footerActions}>
      {userId && isCustom && <Button disabled={pending} name="mode" value="inherit" type="submit" variant="outline"><RotateCcw aria-hidden="true" />恢复默认权限</Button>}
      <Button className={styles.saveButton} disabled={pending} name="mode" value="custom" type="submit">
        <Save aria-hidden="true" />
        {pending ? "正在保存" : userId ? "保存该用户权限" : "保存默认权限"}
      </Button>
    </div>
  );
}

export function MenuPermissionsForm({ groups, userId, username, isCustom }: {
  groups: MenuPermissionGroup[];
  userId?: string;
  username?: string;
  isCustom: boolean;
}) {
  const items = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.href, item.isVisible])),
  );
  const enabledCount = items.filter((item) => visibility[item.href]).length;

  function setAll(isVisible: boolean) {
    setVisibility(Object.fromEntries(items.map((item) => [item.href, isVisible])));
  }

  return (
    <form action={updateMenuPermissionsAction} className={styles.permissionForm}>
      <input type="hidden" name="userId" value={userId ?? ""} />
      <PermissionFields>
        <div className={styles.formToolbar}>
          <div className={styles.permissionCount} aria-live="polite">
            <Eye aria-hidden="true" />
            <span>{username ?? "默认业务员"}当前可见</span>
            <strong>{enabledCount}</strong>
            <span>/ {items.length} 个业务页面</span>
          </div>
          <div className={styles.bulkActions}>
            <Button type="button" variant="outline" onClick={() => setAll(true)}>
              <Eye aria-hidden="true" />全部开启
            </Button>
            <Button type="button" variant="outline" onClick={() => setAll(false)}>
              <EyeOff aria-hidden="true" />全部关闭
            </Button>
          </div>
        </div>

        <div className={styles.permissionGroups}>
          {groups.map((group) => (
            <section className={styles.permissionGroup} key={group.title} aria-labelledby={`permission-${group.title}`}>
              <div className={styles.groupHeading}>
                <h2 id={`permission-${group.title}`}>{group.title}</h2>
                <span>{group.items.filter((item) => visibility[item.href]).length} / {group.items.length} 已开启</span>
              </div>
              <div className={styles.permissionGrid}>
                {group.items.map((item) => {
                  const Icon = getNavigationIcon(item.href);
                  const isVisible = visibility[item.href] ?? false;

                  return (
                    <label className={styles.permissionItem} data-enabled={isVisible || undefined} key={item.href}>
                      <input
                        checked={isVisible}
                        className={styles.permissionInput}
                        name="menuKey"
                        onChange={(event) => setVisibility((current) => ({ ...current, [item.href]: event.target.checked }))}
                        type="checkbox"
                        value={item.href}
                      />
                      <span className={styles.itemIcon}><Icon aria-hidden="true" /></span>
                      <span className={styles.itemCopy}>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className={styles.toggle} aria-hidden="true"><span><Check /></span></span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className={styles.formFooter}>
          <p>{userId ? <>当前保存对象：<strong>{username}</strong>。保存后仅影响该用户。</> : "保存后，跟随默认配置的业务员将使用此权限，单独配置不受影响。"}</p>
          <SaveButtons userId={userId} isCustom={isCustom} />
        </footer>
      </PermissionFields>
    </form>
  );
}
