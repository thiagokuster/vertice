import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { createExit } from "@/server/actions/stock";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function nowValue() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default async function SaidasPage() {
  await requirePermission(Permission.STOCK_EXIT);
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Saída de mercadoria" description="A quantidade não pode passar do saldo disponível. O sistema retira primeiro o lote que vence antes e recusa lote vencido." />
      <ActionForm action={createExit} className="grid max-w-3xl gap-4 md:grid-cols-2">
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
        <Field label="Quantidade retirada"><Input name="quantity" type="number" min={1} required /></Field>
        <Field label="Data e horário"><Input name="occurredAt" type="datetime-local" required defaultValue={nowValue()} /></Field>
        <Field label="Motivo"><Input name="reason" required minLength={3} /></Field>
        <Field label="Destino ou setor"><Input name="destination" /></Field>
        <div className="md:col-span-2"><Field label="Observações"><Textarea name="notes" /></Field></div>
        <SubmitButton>Confirmar saída</SubmitButton>
      </ActionForm>
    </div>
  );
}
