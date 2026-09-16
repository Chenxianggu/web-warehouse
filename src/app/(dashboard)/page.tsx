import { requireUser } from "@/server/current-user";
import { getVisibleNavigation } from "@/server/menu-permissions";
import { HomeWorkbench } from "@/components/home-workbench";

export default async function HomePage() {
  const user = await requireUser();
  const visibleNavigation = await getVisibleNavigation(user.role);
  return <HomeWorkbench groups={visibleNavigation} username={user.username} />;
}
