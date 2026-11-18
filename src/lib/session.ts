import "server-only";
import { redirect } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import { userCan } from "@/lib/permissions";
import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const locked = user?.lockedUntil != null && user.lockedUntil > new Date();
  if (!user || !user.active || locked || user.tokenVersion !== session.user.tokenVersion) {
    await signOut({ redirectTo: "/login" });
    redirect("/login");
  }
  return user;
}

export async function assertPermission(permission: Permission) {
  const user = await requireUser();
  if (await userCan(user, permission)) return { ok: true as const, user };
  await writeAudit(prisma, {
    userId: user.id,
    action: "ACCESS_DENIED",
    entity: "Permission",
    metadata: { permission },
  });
  return { ok: false as const, message: "Você não tem permissão para esta ação." };
}

export async function requirePermission(permission: Permission) {
  const gate = await assertPermission(permission);
  if (!gate.ok) redirect("/acesso-negado");
  return gate.user;
}

export async function requireAny(permissions: Permission[]) {
  const user = await requireUser();
  for (const permission of permissions) {
    if (await userCan(user, permission)) return user;
  }
  await writeAudit(prisma, {
    userId: user.id,
    action: "ACCESS_DENIED",
    entity: "Permission",
    metadata: { permissions },
  });
  redirect("/acesso-negado");
}
