import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { UserRole } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db";
import { verifyPassword } from "@/features/identity/password";

const credentialsSchema = z.object({
  username: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  providers: [
    Credentials({
      credentials: {
        username: { label: "用户名", type: "text" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await getPrisma().user.findUnique({ where: { username: parsed.data.username } });
        if (!user?.isActive) return null;
        if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (
        typeof token.userId === "string" &&
        (token.role === UserRole.SUPER_ADMIN || token.role === UserRole.SALESPERSON) &&
        typeof token.sessionVersion === "number"
      ) {
        session.user.id = token.userId;
        session.user.role = token.role;
        session.user.sessionVersion = token.sessionVersion;
      }
      return session;
    },
  },
});
