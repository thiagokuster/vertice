import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { createEntry } from "@/server/actions/stock";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default async function EntradasPage() {
  await requirePermission(Permission.STOCK_ENTRY);
  const [products, warehouses, suppliers] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Entrada de mercadoria" description="Ao confirmar, o saldo do depósito é atualizado na mesma transação." />
      <ActionForm action={createEntry} className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Field label="Produto">
          <NativeSelect name="productId" required defaultValue="">
            <option value="">Selecione</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Depósito">
          <NativeSelect name="warehouseId" required defaultValue={warehouses[0]?.id ?? ""}>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Quantidade recebida"><Input name="quantity" type="number" min={1} required /></Field>
        <Field label="Data da entrada"><Input name="occurredAt" type="date" required defaultValue={today()} /></Field>
        <Field label="Fornecedor">
          <NativeSelect name="supplierId" defaultValue="">
            <option value="">Não informado</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Nota fiscal"><Input name="invoiceNumber" /></Field>
        <Field label="Lote"><Input name="lotCode" /></Field>
        <Field label="Validade" hint="Obrigatória quando o produto controla validade."><Input name="expiryDate" type="date" /></Field>
        <div className="md:col-span-2"><Field label="Observações"><Textarea name="notes" /></Field></div>
        <SubmitButton>Confirmar entrada</SubmitButton>
      </ActionForm>
    </div>
  );
}
