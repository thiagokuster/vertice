import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { createTransfer } from "@/server/actions/stock";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default async function TransferenciasPage() {
  await requirePermission(Permission.STOCK_TRANSFER);
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Transferência entre depósitos" description="O saldo sai de um depósito e entra no outro, com as duas pernas no histórico." />
      <ActionForm action={createTransfer} className="grid max-w-3xl gap-4 md:grid-cols-2">
        <Field label="Produto">
          <NativeSelect name="productId" required defaultValue="">
            <option value="">Selecione</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Quantidade"><Input name="quantity" type="number" min={1} required /></Field>
        <Field label="Origem">
          <NativeSelect name="fromWarehouseId" required defaultValue={warehouses[0]?.id ?? ""}>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Destino">
          <NativeSelect name="toWarehouseId" required defaultValue={warehouses[1]?.id ?? warehouses[0]?.id ?? ""}>
            {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Data"><Input name="occurredAt" type="date" required defaultValue={today()} /></Field>
        <div className="md:col-span-2"><Field label="Observações"><Textarea name="notes" /></Field></div>
        <SubmitButton>Confirmar transferência</SubmitButton>
      </ActionForm>
    </div>
  );
}
