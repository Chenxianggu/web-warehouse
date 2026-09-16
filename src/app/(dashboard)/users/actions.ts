"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { hashPassword, passwordSchema } from "@/features/identity/password";
import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";

export async function createUserAction(formData: FormData) {
  await requireAdmin();
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const rawRole = formData.get("role");
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const role = rawRole === UserRole.SUPER_ADMIN || rawRole === UserRole.SALESPERSON ? rawRole : null;

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) redirect("/users?error=username");
  if (!passwordSchema.safeParse(password).success) redirect("/users?error=password");
  if (!role) redirect("/users?error=role");

  try {
    await getPrisma().user.create({
      data: { username, passwordHash: await hashPassword(password), role },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      redirect("/users?error=duplicate");
    }
    throw error;
  }

  revalidatePath("/users");
  redirect(`/users?notice=created&role=${role}`);
}

export async function resetUserPasswordAction(formData: FormData) {
  const currentUser = await requireAdmin();
  const id = formData.get("userId");
  const password = formData.get("password");
  if (typeof id !== "string" || typeof password !== "string" || !passwordSchema.safeParse(password).success) {
    redirect("/users?error=password");
  }
  if (id === currentUser.id) redirect("/users?error=self-reset");

  const result = await getPrisma().user.updateMany({
    where: { id },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
  if (result.count !== 1) redirect("/users?error=missing");
  revalidatePath("/users");
  redirect("/users?notice=reset");
}
