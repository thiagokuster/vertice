import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { LOGIN_LIMIT } from "@/lib/rate-limit";
import { clientIpFrom } from "@/lib/client-ip";
import { assertProductionAuthSecret } from "@/lib/secrets";
import { emailSchema } from "@/lib/validators";
import { SESSION_HOURS } from "@/lib/constants";

const dummyHash = bcrypt.hash("senha-inexistente", 12);

class AccountLockedError extends CredentialsSignin {
  code = "account_locked";
}

class InactiveAccountError extends CredentialsSignin {
  code = "account_inactive";
}

function requestMeta(request: Request | undefined) {
  return clientIpFrom(request?.headers ?? { get: () => null });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_HOURS * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials, request) => {
        assertProductionAuthSecret();
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        const meta = requestMeta(request);
        const parsedEmail = emailSchema.safeParse(email);
        if (!parsedEmail.success || !password) {
          await prisma.loginAttempt.create({
            data: { email: email || "invalido", success: false, ip: meta.ip, userAgent: meta.userAgent },
          });
          return null;
        }

        const settings = await getSettings();
        const since = new Date(Date.now() - settings.lockoutMinutes * 60 * 1000);
        const placeholder = await dummyHash;
        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.findUnique({ where: { email } });
          const attempt = await tx.loginAttempt.create({
            data: { email, userId: user?.id, success: false, ip: meta.ip, userAgent: meta.userAgent },
          });
          const byEmail = await tx.loginAttempt.count({
            where: { email, success: false, createdAt: { gte: since } },
          });
          const byIp = meta.ip
            ? await tx.loginAttempt.count({
                where: { ip: meta.ip, success: false, createdAt: { gte: since } },
              })
            : 0;
          const limited = byEmail > settings.maxLoginAttempts || (Boolean(meta.ip) && byIp > LOGIN_LIMIT);
          const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? placeholder);
          if (user && passwordOk && user.lockedUntil && user.lockedUntil > new Date()) {
            return { status: "locked" as const };
          }
          if (user && passwordOk && !user.active) return { status: "inactive" as const, userId: user.id };
          if (user && passwordOk) {
            const updated = await tx.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
            });
            await tx.loginAttempt.update({ where: { id: attempt.id }, data: { success: true } });
            return { status: "ok" as const, user: updated };
          }
          if (user && !limited) {
            await tx.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: { increment: 1 } },
            });
          }
          return { status: limited ? ("limited" as const) : ("invalid" as const), userId: user?.id };
        });

        if (result.status === "locked") throw new AccountLockedError();
        if (result.status === "inactive") {
          await writeAudit(prisma, {
            userId: result.userId,
            action: "LOGIN_BLOCKED",
            entity: "User",
            entityId: result.userId,
            metadata: { reason: "inactive" },
            ...meta,
          });
          throw new InactiveAccountError();
        }
        if (result.status === "ok") {
          await writeAudit(prisma, {
            userId: result.user.id,
            action: "LOGIN",
            entity: "User",
            entityId: result.user.id,
            ...meta,
          });
          return {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: result.user.role,
            tokenVersion: result.user.tokenVersion,
          };
        }
        await writeAudit(prisma, {
          userId: result.userId,
          action: result.status === "limited" ? "LOGIN_THROTTLED" : "LOGIN_FAILED",
          entity: "User",
          entityId: result.userId,
          metadata: { email },
          ...meta,
        });
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tokenVersion = user.tokenVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? token.sub ?? "");
        session.user.role = (token.role as typeof session.user.role | undefined) ?? "ASSISTANT";
        session.user.tokenVersion = Number(token.tokenVersion ?? 0);
      }
      return session;
    },
  },
});
