import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { createAdjustment } from "@/server/actions/stock";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default async function AjustesPage() {
  await requirePermission(Permission.STOCK_ADJUST);
  const [products, warehouses] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.warehouse.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Ajuste manual" description="Informa a nova quantidade. A diferença fica registrada e o lançamento original não é apagado." />
      <ActionForm action={createAdjustment} className="grid max-w-3xl gap-4">
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
        <Field label="Nova quantidade"><Input name="newQuantity" type="number" min={0} required /></Field>
        <Field label="Justificativa" hint="Mínimo de 10 caracteres."><Textarea name="reason" required minLength={10} /></Field>
        <SubmitButton>Registrar ajuste</SubmitButton>
      </ActionForm>
    </div>
  );
}
