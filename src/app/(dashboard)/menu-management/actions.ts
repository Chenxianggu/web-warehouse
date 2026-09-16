"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { configurableMenuItems } from "@/server/menu-permissions";
import { requireAdmin } from "@/server/current-user";
import { getPrisma } from "@/server/db";

const configurablePaths = new Set(configurableMenuItems.map((item) => item.href));

export async function updateMenuPermissionsAction(formData: FormData) {
  await requireAdmin();
  const submittedValues = formData.getAll("menuKey");
  const selectedPaths = new Set(
    submittedValues.filter((value): value is string => typeof value === "string"),
  );

  if ([...selectedPaths].some((path) => !configurablePaths.has(path))) {
    redirect("/menu-management?error=invalid");
  }

  const prisma = getPrisma();
  await prisma.$transaction(
    configurableMenuItems.map((item) =>
      prisma.salespersonMenuPermission.upsert({
        where: { menuKey: item.href },
        create: { menuKey: item.href, isVisible: selectedPaths.has(item.href) },
        update: { isVisible: selectedPaths.has(item.href) },
      }),
    ),
  );

  revalidatePath("/", "layout");
  redirect("/menu-management?notice=saved");
}
