import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  const cached = globalForPrisma.prisma;
  // Dev keeps one client on globalThis. After `prisma generate`, that instance
  // belongs to the previous client class and is missing new models.
  if (cached?.constructor === PrismaClient) return cached;
  if (cached) void cached.$disconnect().catch(() => undefined);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 未配置");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = prisma;
  return prisma;
}
