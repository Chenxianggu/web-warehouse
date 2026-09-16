import { FloatingSuccessMessage } from "./floating-success-message";

export function MenuSuccessMessage({ duration = 3500 }: { duration?: number }) {
  return (
    <FloatingSuccessMessage
      description="新的菜单规则已对全体业务员生效"
      duration={duration}
      title="权限配置已保存"
    />
  );
}
