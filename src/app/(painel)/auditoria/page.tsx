import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Pager, EmptyState, NativeSelect } from "@/components/page";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; acao?: string; page?: string }>;
}) {
  await requirePermission(Permission.AUDIT_VIEW);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const size = 20;
  const where = {
    ...(params.acao ? { action: params.acao } : {}),
    ...(params.q ? { OR: [{ action: { contains: params.q } }, { entity: { contains: params.q } }, { user: { name: { contains: params.q } } }] } : {}),
  };
  const [total, logs, actions] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div>
      <PageHeader title="Auditoria" description="Registro protegido de acessos e alterações. Usuários comuns não conseguem editar estes dados." />
      <form className="mb-4 grid gap-2 md:grid-cols-4">
        <Input name="q" defaultValue={params.q} placeholder="Usuário, ação ou entidade" />
        <NativeSelect name="acao" defaultValue={params.acao ?? ""}>
          <option value="">Todas as ações</option>
          {actions.map((item) => <option key={item.action}>{item.action}</option>)}
        </NativeSelect>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {logs.length === 0 ? <EmptyState title="Sem registros" text="As ações críticas aparecerão aqui." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Usuário</TableHead><TableHead>Ação</TableHead><TableHead>Entidade</TableHead><TableHead>IP</TableHead><TableHead>Detalhes</TableHead></TableRow></TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>{log.user?.name ?? "—"}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
                <TableCell>{log.ip || "—"}</TableCell>
                <TableCell className="max-w-xs truncate">{log.metadata || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager page={page} pages={pages} hrefFor={(next) => `/auditoria?page=${next}${params.q ? `&q=${params.q}` : ""}${params.acao ? `&acao=${params.acao}` : ""}`} />
    </div>
  );
}
