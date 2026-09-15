import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL 未配置");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = prisma;
  return prisma;
}
