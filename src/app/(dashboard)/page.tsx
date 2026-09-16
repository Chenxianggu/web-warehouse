import { navigation } from "@/config/navigation";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/server/current-user";
import { HomeWorkbench } from "@/components/home-workbench";

export default async function HomePage() {
  const user = await requireUser();
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== "/users" || user.role === UserRole.SUPER_ADMIN),
    }))
    .filter((group) => group.items.length > 0);
  return <HomeWorkbench groups={visibleNavigation} username={user.username} />;
}
