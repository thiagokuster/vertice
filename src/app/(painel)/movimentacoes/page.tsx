import { prisma } from "@/lib/prisma";
import { requireAny } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { createReversal } from "@/server/actions/stock";
import { formatDateTime, formatNumber } from "@/lib/format";
import { movementTitle } from "@/lib/constants";
import { PageHeader, NativeSelect, Pager, EmptyState } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; produto?: string; usuario?: string; de?: string; ate?: string; page?: string }>;
}) {
  const user = await requireAny([Permission.MOVEMENTS_VIEW_ALL, Permission.MOVEMENTS_VIEW_OWN]);
  const [seeAll, canReverse] = await Promise.all([
    userCan(user, Permission.MOVEMENTS_VIEW_ALL),
    userCan(user, Permission.STOCK_ADJUST),
  ]);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const size = 15;
  const where = {
    ...(params.tipo ? { type: params.tipo as "ENTRY" | "EXIT" | "ADJUSTMENT" | "TRANSFER" | "REVERSAL" } : {}),
    ...(params.produto ? { productId: params.produto } : {}),
    userId: seeAll ? params.usuario || undefined : user.id,
    ...(params.de || params.ate
      ? { occurredAt: { ...(params.de ? { gte: new Date(`${params.de}T00:00:00`) } : {}), ...(params.ate ? { lte: new Date(`${params.ate}T23:59:59`) } : {}) } }
      : {}),
  };
  const [total, movements, products, users] = await Promise.all([
    prisma.movement.count({ where }),
    prisma.movement.findMany({
      where,
      include: { product: true, user: true, warehouse: true, reversedBy: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    seeAll ? prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const hrefFor = (next: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("page", String(next));
    return `/movimentacoes?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader title={seeAll ? "Histórico de movimentações" : "Minhas movimentações"} description="Lançamentos confirmados não são apagados. A correção é um estorno." />
      <form className="mb-4 grid gap-2 md:grid-cols-6">
        <NativeSelect name="tipo" defaultValue={params.tipo ?? ""}>
          <option value="">Todos os tipos</option>
          <option value="ENTRY">Entrada</option>
          <option value="EXIT">Saída</option>
          <option value="TRANSFER">Transferência</option>
          <option value="ADJUSTMENT">Ajuste</option>
          <option value="REVERSAL">Estorno</option>
        </NativeSelect>
        <NativeSelect name="produto" defaultValue={params.produto ?? ""}>
          <option value="">Todos os produtos</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.sku}</option>)}
        </NativeSelect>
        {seeAll ? (
          <NativeSelect name="usuario" defaultValue={params.usuario ?? ""}>
            <option value="">Todos os usuários</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </NativeSelect>
        ) : null}
        <Input name="de" type="date" defaultValue={params.de} />
        <Input name="ate" type="date" defaultValue={params.ate} />
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {movements.length === 0 ? <EmptyState title="Sem movimentações" text="Nada encontrado para estes filtros." /> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Produto</TableHead><TableHead>Antes</TableHead><TableHead>Qtd.</TableHead><TableHead>Depois</TableHead><TableHead>Depósito</TableHead><TableHead>Responsável</TableHead><TableHead>Origem</TableHead><TableHead>Justificativa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                <TableCell>{movementTitle(movement.type, movement.effect)}</TableCell>
                <TableCell>{movement.product.name}</TableCell>
                <TableCell className="tabular-nums">{formatNumber(movement.quantityBefore)}</TableCell>
                <TableCell className="tabular-nums">{formatNumber(movement.quantity)}</TableCell>
                <TableCell className="tabular-nums">{formatNumber(movement.quantityAfter)}</TableCell>
                <TableCell>{movement.warehouse.name}</TableCell>
                <TableCell>{movement.user.name}</TableCell>
                <TableCell>{movement.origin}</TableCell>
                <TableCell>
                  <p>{movement.reason || movement.notes || movement.destination || "—"}</p>
                  {canReverse && movement.type !== "REVERSAL" && !movement.reversedBy ? (
                    <ActionForm action={createReversal} className="mt-2 flex gap-2">
                      <input type="hidden" name="movementId" value={movement.id} />
                      <Input name="reason" placeholder="Justificativa do estorno" required minLength={10} />
                      <SubmitButton variant="outline">Estornar</SubmitButton>
                    </ActionForm>
                  ) : movement.reversedBy ? <p className="text-xs text-muted-foreground">Estornada</p> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Pager page={page} pages={pages} hrefFor={hrefFor} />
    </div>
  );
}
