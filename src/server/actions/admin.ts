"use server";

import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRequestMeta } from "@/lib/http";
import { Permission, isDelegable } from "@/lib/permissions";
import { assertPermission } from "@/lib/session";
import { auditUserChange, assertCanChangeRole, assertCanDeactivate, assertCanDelete } from "@/lib/users";
import { clearSettingsCache, SETTING_KEYS } from "@/lib/settings";
import { DomainError } from "@/lib/domain";
import { clean, emailSchema, integerField, passwordSchema, requiredText } from "@/lib/validators";
import { fail, refreshViews, type ActionResult } from "@/server/result";

function text(formData: FormData, key: string) {
  return clean(formData.get(key));
}

const ROLES: Role[] = ["ADMIN", "OPERATOR", "ASSISTANT"];

function roleOf(value: string): Role {
  if (!ROLES.includes(value as Role)) throw new DomainError("Nível de acesso inválido.");
  return value as Role;
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.USERS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const name = requiredText(text(formData, "name"), 3, 80, "O nome");
    const email = text(formData, "email").toLowerCase();
    if (!emailSchema.safeParse(email).success) throw new DomainError("E-mail inválido.");
    const password = passwordSchema.parse(text(formData, "password"));
    const role = roleOf(text(formData, "role"));
    const meta = await getRequestMeta();
    const user = await prisma.user.create({
      data: { name, email, role, passwordHash: await bcrypt.hash(password, 12) },
    });
    await auditUserChange({ id: gate.user.id, ...meta }, "USER_CREATED", user.id, { email, role });
    refreshViews();
    return { ok: true, message: "Usuário criado." };
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      const issue = (error as { issues?: { message?: string }[] }).issues?.[0]?.message;
      return { ok: false, message: issue ?? "Senha inválida." };
    }
    return fail(error);
  }
}

export async function updateUser(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.USERS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new DomainError("Usuário não encontrado.");
    const name = requiredText(text(formData, "name"), 3, 80, "O nome");
    const role = roleOf(text(formData, "role"));
    await assertCanChangeRole(gate.user.id, target, role);
    const meta = await getRequestMeta();
    await prisma.user.update({ where: { id }, data: { name, role } });
    await auditUserChange({ id: gate.user.id, ...meta }, "USER_UPDATED", id, {
      name,
      role,
      previousRole: target.role,
    });
    refreshViews();
    return { ok: true, message: "Usuário atualizado." };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserActive(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.USERS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const active = text(formData, "active") === "true";
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new DomainError("Usuário não encontrado.");
    if (!active) await assertCanDeactivate(gate.user.id, target);
    const meta = await getRequestMeta();
    await prisma.user.update({
      where: { id },
      data: {
        active,
        tokenVersion: active ? undefined : { increment: 1 },
        failedLoginAttempts: active ? 0 : undefined,
        lockedUntil: active ? null : undefined,
      },
    });
    await auditUserChange({ id: gate.user.id, ...meta }, active ? "USER_ACTIVATED" : "USER_DEACTIVATED", id, {
      email: target.email,
    });
    refreshViews();
    return { ok: true, message: active ? "Conta reativada." : "Conta desativada e sessões encerradas." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteUser(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.USERS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new DomainError("Usuário não encontrado.");
    await assertCanDelete(gate.user.id, target);
    const meta = await getRequestMeta();
    await prisma.user.delete({ where: { id } });
    await auditUserChange({ id: gate.user.id, ...meta }, "USER_DELETED", id, { email: target.email });
    refreshViews();
    return { ok: true, message: "Usuário excluído." };
  } catch (error) {
    return fail(error);
  }
}

export async function adminResetPassword(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.USERS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const password = passwordSchema.parse(text(formData, "password"));
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new DomainError("Usuário não encontrado.");
    const meta = await getRequestMeta();
    await prisma.user.update({
      where: { id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        tokenVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    await auditUserChange({ id: gate.user.id, ...meta }, "PASSWORD_RESET_BY_ADMIN", id, { email: target.email });
    refreshViews();
    return { ok: true, message: "Senha redefinida. As sessões desse usuário foram encerradas." };
  } catch (error) {
    if (error instanceof Error && "issues" in error) {
      return { ok: false, message: "A senha não atende à política de segurança." };
    }
    return fail(error);
  }
}

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  const section = text(formData, "section");
  const permission =
    section === "security"
      ? Permission.SETTINGS_SECURITY
      : section === "alerts"
        ? Permission.ALERTS_CONFIGURE
        : Permission.SETTINGS_GENERAL;
  const gate = await assertPermission(permission);
  if (!gate.ok) return gate;
  try {
    const pairs: [string, string][] =
      section === "security"
        ? [
            [SETTING_KEYS.maxLoginAttempts, String(integerField(text(formData, "maxLoginAttempts"), "As tentativas", 3, 20))],
            [SETTING_KEYS.lockoutMinutes, String(integerField(text(formData, "lockoutMinutes"), "O bloqueio", 1, 1440))],
          ]
        : section === "alerts"
          ? [
              [SETTING_KEYS.expiryWarningDays, String(integerField(text(formData, "expiryWarningDays"), "O aviso de validade", 1, 365))],
              [SETTING_KEYS.suspiciousPercent, String(integerField(text(formData, "suspiciousPercent"), "O percentual suspeito", 1, 100))],
              [SETTING_KEYS.suspiciousQuantity, String(integerField(text(formData, "suspiciousQuantity"), "A quantidade suspeita", 1, 1_000_000))],
              [SETTING_KEYS.highMovementCount, String(integerField(text(formData, "highMovementCount"), "A alta movimentação", 2, 1000))],
            ]
          : [
              [SETTING_KEYS.companyName, requiredText(text(formData, "companyName"), 2, 80, "A empresa")],
              [SETTING_KEYS.companyDocument, text(formData, "companyDocument").slice(0, 20)],
            ];
    await prisma.$transaction(
      pairs.map(([key, value]) =>
        prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } }),
      ),
    );
    clearSettingsCache();
    const meta = await getRequestMeta();
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "SETTINGS_UPDATED",
      entity: "SystemSetting",
      metadata: { section },
      ...meta,
    });
    refreshViews();
    return { ok: true, message: "Configurações salvas." };
  } catch (error) {
    return fail(error);
  }
}

export async function setRolePermission(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.PERMISSIONS_MANAGE);
  if (!gate.ok) return gate;
  try {
    const role = roleOf(text(formData, "role"));
    const permission = text(formData, "permission");
    if (role === "ADMIN" || !isDelegable(role, permission)) {
      throw new DomainError("Esta permissão é fixa e não pode ser delegada.");
    }
    const granted = text(formData, "granted") === "true";
    await prisma.rolePermission.upsert({
      where: { role_permission: { role, permission } },
      update: { granted },
      create: { role, permission, granted },
    });
    const meta = await getRequestMeta();
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "PERMISSION_CHANGED",
      entity: "RolePermission",
      metadata: { role, permission, granted },
      ...meta,
    });
    refreshViews();
    return { ok: true, message: granted ? "Permissão concedida." : "Permissão revogada." };
  } catch (error) {
    return fail(error);
  }
}

export async function markNotificationRead(formData: FormData): Promise<ActionResult> {
  const user = await assertPermission(Permission.ALERTS_VIEW);
  if (!user.ok) return user;
  const id = text(formData, "id");
  await prisma.notification.updateMany({
    where: { id, userId: user.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  refreshViews();
  return { ok: true, message: "Notificação lida." };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await assertPermission(Permission.ALERTS_VIEW);
  if (!user.ok) return user;
  await prisma.notification.updateMany({
    where: { userId: user.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  refreshViews();
  return { ok: true, message: "Notificações marcadas como lidas." };
}
