import type { Role, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { DomainError } from "@/lib/domain";

type Actor = { id: string; ip?: string | null; userAgent?: string | null };

async function otherActiveAdmins(excludeId: string) {
  return prisma.user.count({
    where: { role: "ADMIN", active: true, id: { not: excludeId } },
  });
}

export async function assertCanDeactivate(actorId: string, target: User) {
  if (actorId === target.id) {
    throw new DomainError("Você não pode desativar a própria conta enquanto estiver autenticado.");
  }
  if (target.role === "ADMIN" && target.active && (await otherActiveAdmins(target.id)) === 0) {
    throw new DomainError("Não é possível desativar o último administrador ativo.");
  }
}

export async function assertCanDelete(actorId: string, target: User) {
  if (actorId === target.id) {
    throw new DomainError("Você não pode excluir a própria conta enquanto estiver autenticado.");
  }
  if (target.role === "ADMIN" && (await otherActiveAdmins(target.id)) === 0) {
    throw new DomainError("Não é possível excluir o último administrador ativo.");
  }
  const [movements, audits] = await Promise.all([
    prisma.movement.count({ where: { userId: target.id } }),
    prisma.auditLog.count({ where: { userId: target.id } }),
  ]);
  if (movements > 0 || audits > 0) {
    throw new DomainError(
      "Este usuário possui histórico. Desative a conta para preservar a auditoria.",
    );
  }
}

export async function assertCanChangeRole(actorId: string, target: User, nextRole: Role) {
  if (actorId === target.id) {
    throw new DomainError("Você não pode alterar o próprio nível de acesso.");
  }
  if (target.role === "ADMIN" && target.active && nextRole !== "ADMIN") {
    if ((await otherActiveAdmins(target.id)) === 0) {
      throw new DomainError("Não é possível rebaixar o último administrador ativo.");
    }
  }
}

export async function auditUserChange(
  actor: Actor,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
) {
  await writeAudit(prisma, {
    userId: actor.id,
    action,
    entity: "User",
    entityId: targetId,
    metadata,
    ip: actor.ip,
    userAgent: actor.userAgent,
  });
}
