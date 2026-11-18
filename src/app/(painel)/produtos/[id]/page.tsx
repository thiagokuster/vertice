import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { saveProduct, deleteProduct } from "@/server/actions/catalog";
import { formatBRL, formatDate, formatDateTime, formatNumber, isLotExpired } from "@/lib/format";
import { movementTitle } from "@/lib/constants";
import { PageHeader } from "@/components/page";
import { ProductFields } from "@/components/product-fields";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission(Permission.PRODUCTS_VIEW);
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      supplier: true,
      balances: { include: { warehouse: true } },
      lots: { where: { quantity: { gt: 0 } }, include: { warehouse: true }, orderBy: { expiryDate: "asc" } },
      movements: { orderBy: { createdAt: "desc" }, take: 8, include: { user: true, warehouse: true } },
    },
  });
  if (!product) notFound();
  const [canEdit, canDelete, categories, suppliers, financial] = await Promise.all([
    userCan(user, Permission.PRODUCTS_UPDATE),
    userCan(user, Permission.PRODUCTS_DELETE),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ orderBy: { companyName: "asc" } }),
    userCan(user, Permission.REPORTS_FINANCIAL),
  ]);
  const total = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        description={`${product.sku} · ${product.category.name}${product.location ? ` · ${product.location}` : ""}`}
        action={
          <div className="flex gap-2">
            <Badge variant={product.active ? "secondary" : "outline"}>{product.active ? "Ativo" : "Inativo"}</Badge>
            {canDelete ? (
              <ConfirmButton
                action={deleteProduct}
                fields={{ id: product.id }}
                label="Excluir"
                title="Excluir produto"
                description="Só é possível excluir produtos sem movimentação. Caso contrário, inative o cadastro."
              />
            ) : null}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardHeader><CardTitle className="text-2xl tabular-nums">{formatNumber(total)} {product.unit}</CardTitle></CardHeader><CardContent>Saldo total</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-2xl tabular-nums">{formatNumber(product.minStock)}</CardTitle></CardHeader><CardContent>Estoque mínimo</CardContent></Card>
        {financial ? <Card><CardHeader><CardTitle className="text-2xl">{formatBRL(product.unitCost)}</CardTitle></CardHeader><CardContent>Custo unitário</CardContent></Card> : null}
      </div>
      {product.imagePath ? <img src={product.imagePath} alt={product.name} className="h-40 rounded-xl object-cover" /> : null}
      <Card>
        <CardHeader><CardTitle>Saldo por depósito</CardTitle></CardHeader>
        <CardContent>
          {product.balances.length === 0 ? <p className="text-sm text-muted-foreground">Ainda não há saldo neste produto.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Depósito</TableHead><TableHead>Quantidade</TableHead></TableRow></TableHeader>
              <TableBody>
                {product.balances.map((balance) => (
                  <TableRow key={balance.id}><TableCell>{balance.warehouse.name}</TableCell><TableCell className="tabular-nums">{formatNumber(balance.quantity)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {product.lots.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Lotes e validade</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Depósito</TableHead><TableHead>Lote</TableHead><TableHead>Validade</TableHead><TableHead>Qtd.</TableHead></TableRow></TableHeader>
              <TableBody>
                {product.lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell>{lot.warehouse.name}</TableCell>
                    <TableCell>{lot.lotCode || "—"}</TableCell>
                    <TableCell>
                      {formatDate(lot.expiryDate)}
                      {isLotExpired(lot.expiryDate) ? <Badge className="ml-2" variant="destructive">Vencido</Badge> : null}
                    </TableCell>
                    <TableCell>{formatNumber(lot.quantity)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Movimentações recentes</CardTitle></CardHeader>
        <CardContent>
          {product.movements.length === 0 ? <p className="text-sm text-muted-foreground">Sem movimentações.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Depósito</TableHead><TableHead>Antes</TableHead><TableHead>Qtd.</TableHead><TableHead>Depois</TableHead><TableHead>Usuário</TableHead></TableRow></TableHeader>
              <TableBody>
                {product.movements.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell>{formatDateTime(movement.occurredAt)}</TableCell>
                    <TableCell>{movementTitle(movement.type, movement.effect)}</TableCell>
                    <TableCell>{movement.warehouse.name}</TableCell>
                    <TableCell>{formatNumber(movement.quantityBefore)}</TableCell>
                    <TableCell>{formatNumber(movement.quantity)}</TableCell>
                    <TableCell>{formatNumber(movement.quantityAfter)}</TableCell>
                    <TableCell>{movement.user.name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {canEdit ? (
        <Card>
          <CardHeader><CardTitle>Editar cadastro</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveProduct} className="space-y-4">
              <input type="hidden" name="id" value={product.id} />
              <ProductFields categories={categories} suppliers={suppliers} product={product} />
              <SubmitButton>Salvar alterações</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
