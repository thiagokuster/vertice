import { prisma } from "@/lib/prisma";
import { requireAny } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { getReport, REPORT_OPTIONS, displayCell, type ReportId } from "@/lib/reports";
import { parseDateInput } from "@/lib/format";
import { PageHeader, NativeSelect, EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireAny([Permission.REPORTS_OPERATIONAL, Permission.REPORTS_FINANCIAL]);
  const params = await searchParams;
  const tipo = (REPORT_OPTIONS.some((item) => item.id === params.tipo) ? params.tipo : "posicao") as ReportId;
  const [financial, canExport, products, categories, suppliers, users] = await Promise.all([
    userCan(user, Permission.REPORTS_FINANCIAL),
    userCan(user, Permission.REPORTS_EXPORT),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, sku: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ orderBy: { companyName: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const report = await getReport(tipo, {
    from: params.de ? parseDateInput(params.de) : null,
    to: params.ate ? parseDateInput(params.ate) : null,
    productId: params.produto,
    categoryId: params.categoria,
    supplierId: params.fornecedor,
    userId: params.usuario,
    financial,
  });
  const exportQuery = new URLSearchParams({ ...params, tipo });
  return (
    <div>
      <PageHeader title="Relatórios" description={financial ? "Inclui custos e preços." : "Visão operacional, sem valores financeiros."} />
      <form className="mb-4 grid gap-2 md:grid-cols-4">
        <NativeSelect name="tipo" defaultValue={tipo}>
          {REPORT_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </NativeSelect>
        <Input name="de" type="date" defaultValue={params.de} />
        <Input name="ate" type="date" defaultValue={params.ate} />
        <NativeSelect name="produto" defaultValue={params.produto ?? ""}>
          <option value="">Todos os produtos</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
        </NativeSelect>
        <NativeSelect name="categoria" defaultValue={params.categoria ?? ""}>
          <option value="">Todas as categorias</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </NativeSelect>
        <NativeSelect name="fornecedor" defaultValue={params.fornecedor ?? ""}>
          <option value="">Todos os fornecedores</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>)}
        </NativeSelect>
        <NativeSelect name="usuario" defaultValue={params.usuario ?? ""}>
          <option value="">Todos os usuários</option>
          {users.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
        </NativeSelect>
        <Button type="submit">Gerar</Button>
      </form>
      {canExport ? (
        <div className="mb-4 flex gap-2">
          <Button variant="outline" render={<a href={`/api/relatorios/export?${exportQuery.toString()}&formato=pdf`} />}>Exportar PDF</Button>
          <Button variant="outline" render={<a href={`/api/relatorios/export?${exportQuery.toString()}&formato=xlsx`} />}>Exportar Excel</Button>
        </div>
      ) : null}
      <p className="mb-3 text-sm text-muted-foreground">{report.description}</p>
      {report.rows.length === 0 ? <EmptyState title="Sem dados" text="Nenhum registro para os filtros escolhidos." /> : (
        <Table>
          <TableHeader>
            <TableRow>{report.columns.map((column) => <TableHead key={column.key}>{column.label}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {report.rows.slice(0, 200).map((row, index) => (
              <TableRow key={index}>
                {report.columns.map((column) => <TableCell key={column.key}>{displayCell(row[column.key] ?? "", column.kind)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
