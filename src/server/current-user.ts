import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { getPrisma } from "@/server/db";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await getPrisma().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, username: true, role: true, isActive: true, sessionVersion: true },
  });

  if (!user?.isActive || user.sessionVersion !== session.user.sessionVersion) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== UserRole.SUPER_ADMIN) redirect("/");
  return user;
}
