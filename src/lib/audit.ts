import type { Prisma, PrismaClient } from "@prisma/client";

type AuditDb = Prisma.TransactionClient | PrismaClient;

type AuditEntry = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function writeAudit(db: AuditDb, entry: AuditEntry) {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}
