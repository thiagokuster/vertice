"use server";

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRequestMeta } from "@/lib/http";
import { hitRateLimit } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/mailer";
import { clean, emailSchema, passwordSchema } from "@/lib/validators";
import { fail, isRedirectError, refreshViews, type ActionResult } from "@/server/result";
import { requireUser } from "@/lib/session";

function safeCallback(value: FormDataEntryValue | null) {
  const callback = typeof value === "string" ? value : "";
  if (callback.startsWith("/") && !callback.startsWith("//")) return callback;
  return "/";
}

function loginMessage(error: AuthError) {
  const code = error instanceof CredentialsSignin ? error.code : "";
  if (code === "account_locked") {
    return "Conta bloqueada temporariamente por excesso de tentativas. Aguarde ou fale com o administrador.";
  }
  if (code === "account_inactive") return "Esta conta está desativada. Fale com o administrador.";
  return "E-mail ou senha inválidos.";
}

export async function loginAction(formData: FormData): Promise<ActionResult> {
  const email = clean(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const meta = await getRequestMeta();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success || !password) return { ok: false, message: "Informe e-mail e senha." };
  if (hitRateLimit(`login:${meta.ip}`, 10, 15 * 60 * 1000) || hitRateLimit(`login-email:${email}`, 10, 15 * 60 * 1000)) {
    await prisma.loginAttempt.create({
      data: { email, success: false, ip: meta.ip, userAgent: meta.userAgent },
    });
    await writeAudit(prisma, {
      action: "LOGIN_THROTTLED",
      entity: "User",
      metadata: { email },
      ...meta,
    });
    return { ok: false, message: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }
  try {
    await signIn("credentials", { email, password, redirectTo: safeCallback(formData.get("callbackUrl")) });
  } catch (error) {
    if (isRedirectError(error)) throw error;
    if (error instanceof AuthError) return { ok: false, message: loginMessage(error) };
    return fail(error);
  }
  redirect("/");
}

export async function logoutAction() {
  const session = await auth();
  const meta = await getRequestMeta();
  if (session?.user?.id) {
    await writeAudit(prisma, {
      userId: session.user.id,
      action: "LOGOUT",
      entity: "User",
      entityId: session.user.id,
      ...meta,
    });
  }
  await signOut({ redirectTo: "/login" });
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = clean(formData.get("email")).toLowerCase();
  const meta = await getRequestMeta();
  const generic = "Se o e-mail estiver cadastrado e ativo, enviaremos as instruções de recuperação.";
  if (!emailSchema.safeParse(email).success) return { ok: false, message: "Informe um e-mail válido." };
  if (hitRateLimit(`reset:${email}`, 5, 60 * 60 * 1000)) {
    return { ok: false, message: "Muitas solicitações para este e-mail. Tente mais tarde." };
  }
  const user = await prisma.user.findUnique({ where: { email } });
  await writeAudit(prisma, {
    userId: user?.id,
    action: "PASSWORD_RESET_REQUEST",
    entity: "User",
    entityId: user?.id,
    metadata: { email },
    ...meta,
  });
  if (!user || !user.active) return { ok: true, message: generic };
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  const link = `${process.env.AUTH_URL ?? "http://localhost:3000"}/redefinir-senha?token=${token}`;
  const mail = await sendPasswordResetEmail(user.email, link);
  if (!mail.sent && process.env.NODE_ENV === "development") {
    return { ok: true, message: "Ambiente de desenvolvimento: use o link abaixo para redefinir a senha.", devLink: link };
  }
  return { ok: true, message: generic };
}

export async function resetPassword(formData: FormData): Promise<ActionResult> {
  const token = clean(formData.get("token"));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Senha inválida." };
  if (password !== confirm) return { ok: false, message: "As senhas não conferem." };
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.active) {
    return { ok: false, message: "Link inválido ou expirado. Solicite uma nova recuperação." };
  }
  const meta = await getRequestMeta();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);
  await writeAudit(prisma, {
    userId: record.userId,
    action: "PASSWORD_RESET",
    entity: "User",
    entityId: record.userId,
    ...meta,
  });
  redirect("/login?senha=1");
}

export async function changeOwnPassword(formData: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const current = String(formData.get("current") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Senha inválida." };
    if (password !== confirm) return { ok: false, message: "As senhas não conferem." };
    const matches = await bcrypt.compare(current, user.passwordHash);
    if (!matches) return { ok: false, message: "A senha atual está incorreta." };
    const meta = await getRequestMeta();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
    });
    await writeAudit(prisma, {
      userId: user.id,
      action: "PASSWORD_CHANGED",
      entity: "User",
      entityId: user.id,
      ...meta,
    });
    refreshViews();
    await signOut({ redirectTo: "/login?senha=1" });
    return { ok: true, message: "Senha alterada." };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail(error);
  }
}
