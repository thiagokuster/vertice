"use server";

import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { getRequestMeta } from "@/lib/http";
import { Permission } from "@/lib/permissions";
import { assertPermission } from "@/lib/session";
import { removeUpload, saveProductImage, uploadFile } from "@/lib/files";
import {
  clean,
  emailSchema,
  integerField,
  isValidCnpj,
  moneyField,
  onlyDigits,
  optionalText,
  requiredText,
} from "@/lib/validators";
import { DomainError } from "@/lib/domain";
import { fail, refreshViews, type ActionResult } from "@/server/result";

function text(formData: FormData, key: string) {
  return clean(formData.get(key));
}

async function actor(permission: Permission) {
  const gate = await assertPermission(permission);
  if (!gate.ok) return gate;
  const meta = await getRequestMeta();
  return { ok: true as const, user: gate.user, meta };
}

export async function saveCategory(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.CATEGORIES_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const name = requiredText(text(formData, "name"), 2, 80, "O nome");
    const description = optionalText(text(formData, "description"), 400, "A descrição");
    const active = text(formData, "active") !== "false";
    const data = { name, description, active };
    const category = id
      ? await prisma.category.update({ where: { id }, data })
      : await prisma.category.create({ data });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED",
      entity: "Category",
      entityId: category.id,
      metadata: { name },
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: id ? "Categoria atualizada." : "Categoria cadastrada." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.CATEGORIES_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const products = await prisma.product.count({ where: { categoryId: id } });
    if (products > 0) throw new DomainError("Há produtos nesta categoria. Inative a categoria ou mova os produtos.");
    await prisma.category.delete({ where: { id } });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "CATEGORY_DELETED",
      entity: "Category",
      entityId: id,
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: "Categoria excluída." };
  } catch (error) {
    return fail(error);
  }
}

function supplierData(formData: FormData) {
  const companyName = requiredText(text(formData, "companyName"), 2, 120, "A empresa");
  const cnpjRaw = text(formData, "cnpj");
  const cnpj = cnpjRaw ? onlyDigits(cnpjRaw) : null;
  if (cnpj && !isValidCnpj(cnpj)) throw new DomainError("CNPJ inválido.");
  const email = text(formData, "email");
  if (email && !emailSchema.safeParse(email).success) throw new DomainError("E-mail do fornecedor inválido.");
  return {
    companyName,
    cnpj,
    phone: optionalText(text(formData, "phone"), 20, "O telefone"),
    email: email || null,
    address: optionalText(text(formData, "address"), 240, "O endereço"),
    contactName: optionalText(text(formData, "contactName"), 80, "O contato"),
    notes: optionalText(text(formData, "notes"), 500, "As observações"),
    active: text(formData, "active") !== "false",
  };
}

export async function saveSupplier(formData: FormData): Promise<ActionResult> {
  const id = text(formData, "id");
  const gate = await actor(id ? Permission.SUPPLIERS_UPDATE : Permission.SUPPLIERS_CREATE);
  if (!gate.ok) return gate;
  try {
    const data = supplierData(formData);
    const supplier = id
      ? await prisma.supplier.update({ where: { id }, data })
      : await prisma.supplier.create({ data });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: id ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED",
      entity: "Supplier",
      entityId: supplier.id,
      metadata: { companyName: data.companyName },
      ...gate.meta,
    });
    refreshViews(`/fornecedores/${supplier.id}`);
    return { ok: true, message: id ? "Fornecedor atualizado." : "Fornecedor cadastrado.", id: supplier.id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSupplier(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.SUPPLIERS_DELETE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const [products, movements] = await Promise.all([
      prisma.product.count({ where: { supplierId: id } }),
      prisma.movement.count({ where: { supplierId: id } }),
    ]);
    if (products > 0 || movements > 0) {
      throw new DomainError("Este fornecedor possui histórico. Inative o cadastro em vez de excluir.");
    }
    await prisma.supplier.delete({ where: { id } });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "SUPPLIER_DELETED",
      entity: "Supplier",
      entityId: id,
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: "Fornecedor excluído." };
  } catch (error) {
    return fail(error);
  }
}

export async function saveWarehouse(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.WAREHOUSES_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const name = requiredText(text(formData, "name"), 2, 80, "O nome");
    const code = requiredText(text(formData, "code").toUpperCase(), 2, 20, "O código").replace(/\s+/g, "");
    const description = optionalText(text(formData, "description"), 240, "A descrição");
    const active = text(formData, "active") !== "false";
    const data = { name, code, description, active };
    const warehouse = id
      ? await prisma.warehouse.update({ where: { id }, data })
      : await prisma.warehouse.create({ data });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: id ? "WAREHOUSE_UPDATED" : "WAREHOUSE_CREATED",
      entity: "Warehouse",
      entityId: warehouse.id,
      metadata: { code },
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: id ? "Depósito atualizado." : "Depósito cadastrado." };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteWarehouse(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.WAREHOUSES_MANAGE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const total = await prisma.warehouse.count();
    if (total <= 1) throw new DomainError("O sistema precisa manter ao menos um depósito.");
    const [stock, movements] = await Promise.all([
      prisma.stockBalance.count({ where: { warehouseId: id, quantity: { gt: 0 } } }),
      prisma.movement.count({ where: { OR: [{ warehouseId: id }, { relatedWarehouseId: id }] } }),
    ]);
    if (stock > 0 || movements > 0) {
      throw new DomainError("Depósito com saldo ou histórico não pode ser excluído. Inative-o.");
    }
    await prisma.warehouse.delete({ where: { id } });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "WAREHOUSE_DELETED",
      entity: "Warehouse",
      entityId: id,
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: "Depósito excluído." };
  } catch (error) {
    return fail(error);
  }
}

async function productInput(formData: FormData, currentImage?: string | null) {
  const sku = requiredText(text(formData, "sku").toUpperCase(), 2, 40, "O SKU");
  const barcode = text(formData, "barcode");
  const name = requiredText(text(formData, "name"), 2, 120, "O nome");
  const categoryId = text(formData, "categoryId");
  if (!categoryId) throw new DomainError("Selecione a categoria.");
  const minStock = integerField(text(formData, "minStock") || "0", "O estoque mínimo", 0, 1_000_000);
  const maxRaw = text(formData, "maxStock");
  const maxStock = maxRaw ? integerField(maxRaw, "O estoque máximo", 1, 1_000_000) : null;
  if (maxStock != null && maxStock < minStock) {
    throw new DomainError("O estoque máximo não pode ser menor que o mínimo.");
  }
  const unitCost = moneyField(text(formData, "unitCost"), "o custo unitário") ?? 0;
  const salePrice = moneyField(text(formData, "salePrice"), "o preço de venda");
  const unit = requiredText(text(formData, "unit").toUpperCase(), 1, 10, "A unidade");
  let imagePath = currentImage ?? null;
  const file = uploadFile(formData.get("image"));
  if (file) {
    imagePath = await saveProductImage(file);
    if (currentImage && currentImage !== imagePath) await removeUpload(currentImage);
  } else if (text(formData, "removeImage") === "true") {
    await removeUpload(currentImage);
    imagePath = null;
  }
  return {
    sku,
    barcode: barcode || null,
    name,
    description: optionalText(text(formData, "description"), 2000, "A descrição"),
    categoryId,
    supplierId: text(formData, "supplierId") || null,
    unit,
    minStock,
    maxStock,
    unitCost,
    salePrice,
    location: optionalText(text(formData, "location"), 120, "A localização"),
    imagePath,
    active: text(formData, "active") !== "false",
    trackExpiry: text(formData, "trackExpiry") === "true",
  };
}

export async function saveProduct(formData: FormData): Promise<ActionResult> {
  const id = text(formData, "id");
  const gate = await actor(id ? Permission.PRODUCTS_UPDATE : Permission.PRODUCTS_CREATE);
  if (!gate.ok) return gate;
  try {
    const current = id ? await prisma.product.findUnique({ where: { id } }) : null;
    if (id && !current) throw new DomainError("Produto não encontrado.");
    const data = await productInput(formData, current?.imagePath);
    const product = id
      ? await prisma.product.update({ where: { id }, data })
      : await prisma.product.create({ data });
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: id ? "PRODUCT_UPDATED" : "PRODUCT_CREATED",
      entity: "Product",
      entityId: product.id,
      metadata: { sku: product.sku, name: product.name },
      ...gate.meta,
    });
    refreshViews(`/produtos/${product.id}`);
    return { ok: true, message: id ? "Produto atualizado." : "Produto cadastrado.", id: product.id };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteProduct(formData: FormData): Promise<ActionResult> {
  const gate = await actor(Permission.PRODUCTS_DELETE);
  if (!gate.ok) return gate;
  try {
    const id = text(formData, "id");
    const movements = await prisma.movement.count({ where: { productId: id } });
    if (movements > 0) {
      throw new DomainError(
        "Produtos com movimentações não podem ser excluídos. Inative o cadastro para preservar a auditoria.",
      );
    }
    const product = await prisma.product.delete({ where: { id } });
    await removeUpload(product.imagePath);
    await writeAudit(prisma, {
      userId: gate.user.id,
      action: "PRODUCT_DELETED",
      entity: "Product",
      entityId: id,
      metadata: { sku: product.sku },
      ...gate.meta,
    });
    refreshViews();
    return { ok: true, message: "Produto excluído." };
  } catch (error) {
    return fail(error);
  }
}
