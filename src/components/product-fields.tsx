import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, NativeSelect } from "@/components/page";
import { UNITS } from "@/lib/constants";

type Category = { id: string; name: string };
type Supplier = { id: string; companyName: string };
type Product = {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  supplierId: string | null;
  unit: string;
  minStock: number;
  maxStock: number | null;
  unitCost: number;
  salePrice: number | null;
  location: string | null;
  active: boolean;
  trackExpiry: boolean;
};

function money(cents: number | null | undefined) {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function ProductFields({
  categories,
  suppliers,
  product,
}: {
  categories: Category[];
  suppliers: Supplier[];
  product?: Product;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="SKU"><Input name="sku" required defaultValue={product?.sku} /></Field>
      <Field label="Código de barras"><Input name="barcode" defaultValue={product?.barcode ?? ""} /></Field>
      <Field label="Nome" ><Input name="name" required defaultValue={product?.name} className="md:col-span-1" /></Field>
      <Field label="Unidade">
        <NativeSelect name="unit" defaultValue={product?.unit ?? "UN"}>
          {UNITS.map((unit) => <option key={unit}>{unit}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Categoria">
        <NativeSelect name="categoryId" required defaultValue={product?.categoryId ?? ""}>
          <option value="">Selecione</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Fornecedor">
        <NativeSelect name="supplierId" defaultValue={product?.supplierId ?? ""}>
          <option value="">Sem fornecedor padrão</option>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.companyName}</option>)}
        </NativeSelect>
      </Field>
      <Field label="Estoque mínimo"><Input name="minStock" type="number" min={0} defaultValue={product?.minStock ?? 0} required /></Field>
      <Field label="Estoque máximo"><Input name="maxStock" type="number" min={0} defaultValue={product?.maxStock ?? ""} /></Field>
      <Field label="Custo unitário (R$)"><Input name="unitCost" defaultValue={money(product?.unitCost)} placeholder="0,00" /></Field>
      <Field label="Preço de venda (R$)"><Input name="salePrice" defaultValue={money(product?.salePrice)} placeholder="0,00" /></Field>
      <Field label="Localização"><Input name="location" defaultValue={product?.location ?? ""} placeholder="Corredor, prateleira" /></Field>
      <Field label="Status">
        <NativeSelect name="active" defaultValue={product?.active === false ? "false" : "true"}>
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </NativeSelect>
      </Field>
      <Field label="Controlar validade">
        <NativeSelect name="trackExpiry" defaultValue={product?.trackExpiry ? "true" : "false"}>
          <option value="false">Não</option>
          <option value="true">Sim</option>
        </NativeSelect>
      </Field>
      <Field label="Imagem"><Input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></Field>
      <div className="md:col-span-2">
        <Field label="Descrição"><Textarea name="description" defaultValue={product?.description ?? ""} /></Field>
      </div>
    </div>
  );
}
