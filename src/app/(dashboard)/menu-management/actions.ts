"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { configurableMenuItems, parseMenuSelection } from "@/features/identity/menu-permissions";
import { requireAdmin } from "@/server/current-user";
import { auditTransaction } from "@/server/audit";

export async function updateMenuPermissionsAction(formData: FormData) {
  const actor = await requireAdmin();
  const target = formData.get("userId");
  const mode = formData.get("mode");
  if (typeof target !== "string" || !["custom", "inherit"].includes(String(mode))) {
    redirect("/menu-management?error=invalid");
  }
  const userId = target || undefined;
  const base = userId ? `/menu-management?userId=${encodeURIComponent(userId)}&` : "/menu-management?";
  const selectedPaths = parseMenuSelection(formData.getAll("menuKey"));
  if (selectedPaths === null || (!userId && mode === "inherit")) redirect(`${base}error=invalid`);

  const saved = await auditTransaction(actor, async (tx) => {
    if (userId) {
      const targetUser = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!targetUser || targetUser.role !== UserRole.SALESPERSON) return false;
      if (mode === "inherit") {
        await tx.userMenuPermission.deleteMany({ where: { userId } });
      } else {
        await tx.userMenuPermission.upsert({
          where: { userId },
          create: { userId, menuKeys: selectedPaths },
          update: { menuKeys: selectedPaths },
        });
      }
    } else {
      const selected = new Set(selectedPaths);
      for (const item of configurableMenuItems) {
        await tx.salespersonMenuPermission.upsert({
          where: { menuKey: item.href },
          create: { menuKey: item.href, isVisible: selected.has(item.href) },
          update: { isVisible: selected.has(item.href) },
        });
      }
    }
    return true;
  });
  if (!saved) redirect("/menu-management?error=target");

  revalidatePath("/", "layout");
  redirect(`${base}notice=${mode === "inherit" ? "inherited" : "saved"}`);
}
