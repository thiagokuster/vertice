import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { formatNumber } from "@/lib/format";
import { PageHeader, EmptyState, Pager, NativeSelect } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categoria?: string; status?: string; page?: string }>;
}) {
  const user = await requirePermission(Permission.PRODUCTS_VIEW);
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const size = 12;
  const where = {
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q } },
            { sku: { contains: params.q.toUpperCase() } },
            { barcode: { contains: params.q } },
          ],
        }
      : {}),
    ...(params.categoria ? { categoryId: params.categoria } : {}),
    ...(params.status === "ativos" ? { active: true } : params.status === "inativos" ? { active: false } : {}),
  };
  const [categories, total, products, canCreate] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true, balances: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * size,
      take: size,
    }),
    userCan(user, Permission.PRODUCTS_CREATE),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const query = (next: number) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.categoria) search.set("categoria", params.categoria);
    if (params.status) search.set("status", params.status);
    search.set("page", String(next));
    return `/produtos?${search.toString()}`;
  };

  return (
    <div>
      <PageHeader
        title="Produtos"
        description="Consulte saldo, localização e situação de cada item."
        action={canCreate ? (
          <div className="flex gap-2">
            <Button variant="outline" render={<Link href="/produtos/importar" />}>Importar CSV</Button>
            <Button render={<Link href="/produtos/novo" />}>Novo produto</Button>
          </div>
        ) : null}
      />
      <form className="mb-4 grid gap-2 md:grid-cols-4">
        <Input name="q" defaultValue={params.q} placeholder="Nome, SKU ou código de barras" />
        <NativeSelect name="categoria" defaultValue={params.categoria ?? ""}>
          <option value="">Todas as categorias</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={params.status ?? ""}>
          <option value="">Todos os status</option>
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
        </NativeSelect>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      {products.length === 0 ? (
        <EmptyState title="Nenhum produto encontrado" text="Ajuste os filtros ou cadastre o primeiro item." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Local</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => {
              const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
              return (
                <TableRow key={product.id}>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell><Link className="font-medium hover:underline" href={`/produtos/${product.id}`}>{product.name}</Link></TableCell>
                  <TableCell>{product.category.name}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(quantity)} {product.unit}</TableCell>
                  <TableCell>{product.location || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={product.active ? "secondary" : "outline"}>{product.active ? "Ativo" : "Inativo"}</Badge>
                    {quantity === 0 ? <Badge className="ml-1" variant="destructive">Sem estoque</Badge> : null}
                    {quantity > 0 && quantity < product.minStock ? <Badge className="ml-1" variant="outline">Baixo</Badge> : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Pager page={page} pages={pages} hrefFor={query} />
    </div>
  );
}
