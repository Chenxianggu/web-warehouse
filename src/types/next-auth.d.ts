import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/client";

declare module "next-auth" {
  interface User {
    role: UserRole;
    sessionVersion: number;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
      sessionVersion: number;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    role?: UserRole;
    sessionVersion?: number;
  }
}
