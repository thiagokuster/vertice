"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRequestMeta } from "@/lib/http";
import { parseProductCsv } from "@/lib/csv";
import { DomainError } from "@/lib/domain";
import { uploadFile } from "@/lib/files";
import { Permission, userCan } from "@/lib/permissions";
import { assertPermission } from "@/lib/session";
import { integerField, moneyField } from "@/lib/validators";
import { fail, refreshViews, type ActionResult } from "@/server/result";

const YES = new Set(["sim", "s", "true", "1", "yes"]);
const NO = new Set(["nao", "não", "n", "false", "0", "no", ""]);

export async function importProducts(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.PRODUCTS_CREATE);
  if (!gate.ok) return gate;
  try {
    const file = uploadFile(formData.get("file"));
    if (!file) throw new DomainError("Selecione um arquivo CSV.");
    if (file.size > 1024 * 1024) throw new DomainError("O arquivo deve ter no máximo 1 MB.");
    const parsed = parseProductCsv(await file.text());
    if (parsed.error) throw new DomainError(parsed.error);
    if (parsed.rows.length > 500) throw new DomainError("Importe no máximo 500 produtos por arquivo.");

    const canUpdate = await userCan(gate.user, Permission.PRODUCTS_UPDATE);
    const [categories, suppliers] = await Promise.all([
      prisma.category.findMany(),
      prisma.supplier.findMany({ where: { active: true } }),
    ]);
    const categoryByName = new Map(categories.map((category) => [category.name.toLocaleLowerCase("pt-BR"), category]));
    const supplierByName = new Map(suppliers.map((supplier) => [supplier.companyName.toLocaleLowerCase("pt-BR"), supplier]));
    const seen = new Set<string>();
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let categoriesCreated = 0;

    for (const row of parsed.rows) {
      try {
        const sku = row.sku.trim().toUpperCase();
        if (sku.length < 2 || sku.length > 40) throw new DomainError("o SKU deve ter de 2 a 40 caracteres.");
        if (seen.has(sku)) throw new DomainError("SKU repetido no arquivo.");
        seen.add(sku);
        const name = row.name.trim();
        if (name.length < 2 || name.length > 120) throw new DomainError("o nome deve ter de 2 a 120 caracteres.");
        const categoryName = row.category.trim();
        if (categoryName.length < 2 || categoryName.length > 80) throw new DomainError("a categoria deve ter de 2 a 80 caracteres.");
        let category = categoryByName.get(categoryName.toLocaleLowerCase("pt-BR"));
        if (!category) {
          category = await prisma.category.create({ data: { name: categoryName } });
          categoryByName.set(category.name.toLocaleLowerCase("pt-BR"), category);
          categoriesCreated += 1;
        }
        const supplierName = row.supplier.trim();
        let supplierId: string | null = null;
        if (supplierName) {
          const supplier = supplierByName.get(supplierName.toLocaleLowerCase("pt-BR"));
          if (!supplier) throw new DomainError(`fornecedor "${supplierName}" não está cadastrado.`);
          supplierId = supplier.id;
        }
        const unit = (row.unit.trim() || "UN").toUpperCase();
        if (unit.length < 1 || unit.length > 10) throw new DomainError("a unidade deve ter até 10 caracteres.");
        const minStock = row.min.trim() ? integerField(row.min.trim(), "O estoque mínimo", 0, 1_000_000) : 0;
        const maxStock = row.max.trim() ? integerField(row.max.trim(), "O estoque máximo", 0, 1_000_000) : null;
        if (maxStock != null && maxStock < minStock) throw new DomainError("o estoque máximo não pode ser menor que o mínimo.");
        const unitCost = moneyField(row.cost.trim(), "o custo") ?? 0;
        const salePrice = moneyField(row.price.trim(), "o preço");
        const expiry = row.expiry.trim().toLowerCase();
        if (!YES.has(expiry) && !NO.has(expiry)) throw new DomainError("controla_validade deve ser sim ou não.");
        const barcode = row.barcode.trim() || null;
        const data = {
          sku,
          name,
          description: row.description.trim() || null,
          categoryId: category.id,
          supplierId,
          unit,
          minStock,
          maxStock,
          unitCost,
          salePrice,
          location: row.location.trim() || null,
          barcode,
          trackExpiry: YES.has(expiry),
        };
        const existing = await prisma.product.findUnique({ where: { sku } });
        if (existing) {
          if (!canUpdate) throw new DomainError("este SKU já existe e o perfil não pode alterá-lo.");
          await prisma.product.update({ where: { id: existing.id }, data });
          updated += 1;
        } else {
          await prisma.product.create({ data });
          created += 1;
        }
      } catch (error) {
        const message =
          error instanceof DomainError
            ? error.message
            : error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
              ? "SKU, código de barras ou categoria já existe."
              : "não foi possível gravar esta linha.";
        errors.push(`Linha ${row.line}: ${message}`);
      }
    }

    const meta = await getRequestMeta();
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "PRODUCTS_IMPORTED",
      entity: "Product",
      metadata: { created, updated, categoriesCreated, errors: errors.length },
      ...meta,
    });
    refreshViews();
    const summary = `${created} produto(s) novo(s), ${updated} atualizado(s)${categoriesCreated ? `, ${categoriesCreated} categoria(s) criada(s)` : ""}.`;
    if (created + updated === 0) {
      return { ok: false, message: errors.length ? `${summary} ${errors.slice(0, 8).join(" ")}` : "Nenhum produto foi importado." };
    }
    return {
      ok: true,
      message: errors.length ? `${summary} ${errors.length} linha(s) ignorada(s). ${errors.slice(0, 5).join(" ")}` : summary,
    };
  } catch (error) {
    return fail(error);
  }
}
