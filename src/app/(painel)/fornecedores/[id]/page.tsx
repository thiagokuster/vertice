import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { deleteSupplier } from "@/server/actions/catalog";
import { formatCnpj, formatDateTime, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page";
import { ConfirmButton } from "@/components/action-form";
import { SupplierForm } from "../page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function FornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(Permission.SUPPLIERS_VIEW);
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      products: { orderBy: { name: "asc" } },
      movements: { orderBy: { occurredAt: "desc" }, take: 20, include: { product: true, user: true } },
    },
  });
  if (!supplier) notFound();
  const [canEdit, canDelete] = await Promise.all([
    userCan(user, Permission.SUPPLIERS_UPDATE),
    userCan(user, Permission.SUPPLIERS_DELETE),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title={supplier.companyName}
        description={formatCnpj(supplier.cnpj)}
        action={canDelete ? <ConfirmButton action={deleteSupplier} fields={{ id }} label="Excluir" title="Excluir fornecedor" description="Fornecedores com produtos ou entradas devem ser inativados." /> : null}
      />
      <Card>
        <CardHeader><CardTitle>Produtos relacionados</CardTitle></CardHeader>
        <CardContent>
          {supplier.products.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum produto vinculado.</p> : (
            <ul className="space-y-1 text-sm">{supplier.products.map((product) => <li key={product.id}>{product.sku} — {product.name}</li>)}</ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Histórico de fornecimento</CardTitle></CardHeader>
        <CardContent>
          {supplier.movements.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma entrada vinculada.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Qtd.</TableHead><TableHead>Nota</TableHead><TableHead>Responsável</TableHead></TableRow></TableHeader>
              <TableBody>
                {supplier.movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                    <TableCell>{movement.product.name}</TableCell>
                    <TableCell>{formatNumber(movement.quantity)}</TableCell>
                    <TableCell>{movement.invoiceNumber || "—"}</TableCell>
                    <TableCell>{movement.user.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {canEdit ? <Card><CardHeader><CardTitle>Editar</CardTitle></CardHeader><CardContent><SupplierForm supplier={supplier} actionLabel="Salvar" /></CardContent></Card> : null}
    </div>
  );
}
