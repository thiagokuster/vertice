import { DomainError } from "@/lib/domain";
import { integerField, moneyField } from "@/lib/validators";
import type { ProductCsvRow } from "@/lib/csv";

const YES = new Set(["sim", "s", "true", "1", "yes"]);
const NO = new Set(["nao", "não", "n", "false", "0", "no", ""]);

export type ProductImportData = {
  sku: string;
  name: string;
  categoryId: string;
  description?: string | null;
  supplierId?: string | null;
  unit?: string;
  minStock?: number;
  maxStock?: number | null;
  unitCost?: number;
  salePrice?: number | null;
  location?: string | null;
  barcode?: string | null;
  trackExpiry?: boolean;
};

export function productImportPlan(input: {
  row: ProductCsvRow;
  fields: string[];
  categoryId: string;
  supplierId: string | null;
  creating: boolean;
  current?: { minStock: number; maxStock: number | null };
}): ProductImportData {
  const present = new Set(input.fields);
  const include = (field: string) => input.creating || present.has(field);
  const row = input.row;
  const sku = row.sku.trim().toUpperCase();
  if (sku.length < 2 || sku.length > 40) throw new DomainError("o SKU deve ter de 2 a 40 caracteres.");
  const name = row.name.trim();
  if (name.length < 2 || name.length > 120) throw new DomainError("o nome deve ter de 2 a 120 caracteres.");
  const data: ProductImportData = { sku, name, categoryId: input.categoryId };

  if (include("description")) data.description = row.description.trim() || null;
  if (include("unit")) {
    const unit = (row.unit.trim() || "UN").toUpperCase();
    if (unit.length > 10) throw new DomainError("a unidade deve ter até 10 caracteres.");
    data.unit = unit;
  } else if (input.creating) {
    data.unit = "UN";
  }

  let minStock = input.current?.minStock ?? 0;
  if (include("min")) {
    minStock = row.min.trim() ? integerField(row.min.trim(), "O estoque mínimo", 0, 1_000_000) : 0;
    data.minStock = minStock;
  } else if (input.creating) {
    data.minStock = 0;
  }

  let maxStock = input.current?.maxStock ?? null;
  if (include("max")) {
    maxStock = row.max.trim() ? integerField(row.max.trim(), "O estoque máximo", 0, 1_000_000) : null;
    data.maxStock = maxStock;
  }
  if (maxStock != null && maxStock < minStock) {
    throw new DomainError("o estoque máximo não pode ser menor que o mínimo.");
  }

  if (include("cost")) data.unitCost = moneyField(row.cost.trim(), "o custo") ?? 0;
  else if (input.creating) data.unitCost = 0;
  if (include("price")) data.salePrice = moneyField(row.price.trim(), "o preço");
  if (include("location")) data.location = row.location.trim() || null;
  if (include("barcode")) data.barcode = row.barcode.trim() || null;
  if (include("supplier")) data.supplierId = input.supplierId;
  else if (input.creating) data.supplierId = null;

  if (include("expiry")) {
    const expiry = row.expiry.trim().toLowerCase();
    if (!YES.has(expiry) && !NO.has(expiry)) throw new DomainError("controla_validade deve ser sim ou não.");
    data.trackExpiry = YES.has(expiry);
  } else if (input.creating) {
    data.trackExpiry = false;
  }

  return data;
}
