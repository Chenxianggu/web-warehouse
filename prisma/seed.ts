import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";
import { hashPassword, passwordSchema } from "../src/features/identity/password";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("请先设置 DATABASE_URL");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const existing = await prisma.user.findUnique({ where: { username: "admin" } });
    if (existing) {
      if (existing.role !== UserRole.SUPER_ADMIN) throw new Error("admin 用户已存在，但角色不是超级管理员");
      console.log("admin 已存在，未更改原密码。");
      return;
    }

    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || randomBytes(18).toString("base64url");
    const checked = passwordSchema.safeParse(initialPassword);
    if (!checked.success) throw new Error(`初始密码不符合要求：${checked.error.issues[0]?.message}`);

    await prisma.user.create({
      data: {
        username: "admin",
        role: UserRole.SUPER_ADMIN,
        passwordHash: await hashPassword(initialPassword),
      },
    });

    console.log("超级管理员 admin 创建成功。");
    console.log(`初始密码（仅本次显示，请立即修改）：${initialPassword}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
