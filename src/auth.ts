import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { emailSchema } from "@/lib/validators";
import { SESSION_HOURS } from "@/lib/constants";

class AccountLockedError extends CredentialsSignin {
  code = "account_locked";
}

class InactiveAccountError extends CredentialsSignin {
  code = "account_inactive";
}

function requestMeta(request: Request | undefined) {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || request?.headers.get("x-real-ip") || null,
    userAgent: request?.headers.get("user-agent") || null,
  };
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

        const user = await prisma.user.findUnique({ where: { email } });
        const passwordOk = user ? await bcrypt.compare(password, user.passwordHash) : false;
        const stillLocked = Boolean(user?.lockedUntil && user.lockedUntil > new Date());
        if (!user || !passwordOk) {
          if (user && !stillLocked) {
            const settings = await getSettings();
            const attempts = user.failedLoginAttempts + 1;
            const lockedUntil =
              attempts >= settings.maxLoginAttempts
                ? new Date(Date.now() + settings.lockoutMinutes * 60 * 1000)
                : null;
            await prisma.user.update({
              where: { id: user.id },
              data: { failedLoginAttempts: lockedUntil ? 0 : attempts, lockedUntil },
            });
            await writeAudit(prisma, {
              userId: user.id,
              action: lockedUntil ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
              entity: "User",
              entityId: user.id,
              metadata: { attempts },
              ...meta,
            });
            if (lockedUntil) throw new AccountLockedError();
          } else {
            await writeAudit(prisma, {
              action: "LOGIN_FAILED",
              entity: "User",
              metadata: { email },
              ...meta,
            });
          }
          await prisma.loginAttempt.create({
            data: { email, userId: user?.id, success: false, ip: meta.ip, userAgent: meta.userAgent },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await prisma.loginAttempt.create({
            data: { email, userId: user.id, success: false, ip: meta.ip, userAgent: meta.userAgent },
          });
          throw new AccountLockedError();
        }
        if (!user.active) {
          await prisma.loginAttempt.create({
            data: { email, userId: user.id, success: false, ip: meta.ip, userAgent: meta.userAgent },
          });
          await writeAudit(prisma, {
            userId: user.id,
            action: "LOGIN_BLOCKED",
            entity: "User",
            entityId: user.id,
            metadata: { reason: "inactive" },
            ...meta,
          });
          throw new InactiveAccountError();
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await prisma.loginAttempt.create({
          data: { email, userId: user.id, success: true, ip: meta.ip, userAgent: meta.userAgent },
        });
        await writeAudit(prisma, {
          userId: user.id,
          action: "LOGIN",
          entity: "User",
          entityId: user.id,
          ...meta,
        });
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tokenVersion: user.tokenVersion,
        };
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
