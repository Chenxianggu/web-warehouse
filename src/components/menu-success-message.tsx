import { FloatingSuccessMessage } from "./floating-success-message";

export function MenuSuccessMessage({ duration = 3500, description = "菜单权限已生效" }: { duration?: number; description?: string }) {
  return (
    <FloatingSuccessMessage
      description={description}
      duration={duration}
      title="权限配置已保存"
    />
  );
}
