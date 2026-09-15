"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { hashPassword, passwordSchema, verifyPassword } from "@/features/identity/password";
import { requireUser } from "@/server/current-user";
import { getPrisma } from "@/server/db";

export async function changePasswordAction(formData: FormData) {
  const currentUser = await requireUser();
  const currentPassword = formData.get("currentPassword");
  const newPassword = formData.get("newPassword");
  const confirmPassword = formData.get("confirmPassword");

  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || typeof confirmPassword !== "string") {
    redirect("/settings/password?error=invalid");
  }
  if (newPassword !== confirmPassword) redirect("/settings/password?error=confirm");
  if (!passwordSchema.safeParse(newPassword).success) redirect("/settings/password?error=policy");
  if (newPassword === currentPassword) redirect("/settings/password?error=same");

  const prisma = getPrisma();
  const account = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { passwordHash: true } });
  if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
    redirect("/settings/password?error=current");
  }

  const result = await prisma.user.updateMany({
    where: { id: currentUser.id, passwordHash: account.passwordHash },
    data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
  });
  if (result.count !== 1) redirect("/settings/password?error=retry");

  await signOut({ redirectTo: "/login?changed=1" });
}
