"use server";

import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { hashPassword, passwordSchema } from "@/features/identity/password";
import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";

export async function createSalespersonAction(formData: FormData) {
  await requireAdmin();
  const rawUsername = formData.get("username");
  const rawPassword = formData.get("password");
  const username = typeof rawUsername === "string" ? rawUsername.trim().toLowerCase() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";

  if (!/^[a-z0-9._-]{3,50}$/.test(username)) redirect("/users?error=username");
  if (!passwordSchema.safeParse(password).success) redirect("/users?error=password");

  try {
    await getPrisma().user.create({
      data: { username, passwordHash: await hashPassword(password), role: UserRole.SALESPERSON },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      redirect("/users?error=duplicate");
    }
    throw error;
  }

  redirect("/users?notice=created");
}

export async function resetSalespersonPasswordAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("userId");
  const password = formData.get("password");
  if (typeof id !== "string" || typeof password !== "string" || !passwordSchema.safeParse(password).success) {
    redirect("/users?error=password");
  }

  const result = await getPrisma().user.updateMany({
    where: { id, role: UserRole.SALESPERSON },
    data: { passwordHash: await hashPassword(password), sessionVersion: { increment: 1 } },
  });
  if (result.count !== 1) redirect("/users?error=missing");
  redirect("/users?notice=reset");
}
