"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { configurableMenuItems } from "@/server/menu-permissions";
import { requireAdmin } from "@/server/current-user";
import { auditTransaction } from "@/server/audit";

const configurablePaths = new Set(configurableMenuItems.map((item) => item.href));

export async function updateMenuPermissionsAction(formData: FormData) {
  const user = await requireAdmin();
  const submittedValues = formData.getAll("menuKey");
  const selectedPaths = new Set(
    submittedValues.filter((value): value is string => typeof value === "string"),
  );

  if ([...selectedPaths].some((path) => !configurablePaths.has(path))) {
    redirect("/menu-management?error=invalid");
  }

  await auditTransaction(user, async (tx) => {
    for (const item of configurableMenuItems) {
      await tx.salespersonMenuPermission.upsert({
        where: { menuKey: item.href },
        create: { menuKey: item.href, isVisible: selectedPaths.has(item.href) },
        update: { isVisible: selectedPaths.has(item.href) },
      });
    }
  });

  revalidatePath("/", "layout");
  redirect("/menu-management?notice=saved");
}
