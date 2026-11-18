import type { MovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { endOfDay, formatBRL, formatDate, formatDateTime, startOfDay } from "@/lib/format";
import { movementTitle } from "@/lib/constants";

export const REPORT_OPTIONS = [
  { id: "posicao", label: "Posição de estoque" },
  { id: "entradas", label: "Entradas por período" },
  { id: "saidas", label: "Saídas por período" },
  { id: "movimentacoes", label: "Histórico de movimentações" },
  { id: "abaixo-minimo", label: "Abaixo do estoque mínimo" },
  { id: "sem-estoque", label: "Produtos sem estoque" },
  { id: "mais-movimentados", label: "Produtos mais movimentados" },
  { id: "inventario", label: "Inventário geral" },
] as const;

export type ReportId = (typeof REPORT_OPTIONS)[number]["id"];

export type ReportColumn = {
  key: string;
  label: string;
  kind?: "text" | "number" | "money";
};

export type ReportData = {
  title: string;
  description: string;
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
};

type Filters = {
  from?: Date | null;
  to?: Date | null;
  productId?: string;
  categoryId?: string;
  supplierId?: string;
  userId?: string;
  financial: boolean;
};

function periodLabel(filters: Filters) {
  if (!filters.from && !filters.to) return "Todo o período";
  return `${filters.from ? formatDate(filters.from) : "…"} até ${filters.to ? formatDate(filters.to) : "…"}`;
}

function totalOf(balances: { quantity: number }[]) {
  return balances.reduce((sum, balance) => sum + balance.quantity, 0);
}

export async function getReport(id: ReportId, filters: Filters): Promise<ReportData> {
  const title = REPORT_OPTIONS.find((item) => item.id === id)?.label ?? "Relatório";
  if (id === "posicao" || id === "abaixo-minimo" || id === "sem-estoque" || id === "inventario") {
    return stockReport(id, title, filters);
  }
  if (id === "mais-movimentados") return topReport(title, filters);
  return movementReport(id, title, filters);
}

async function stockReport(id: ReportId, title: string, filters: Filters): Promise<ReportData> {
  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
      ...(filters.productId ? { id: filters.productId } : {}),
    },
    include: {
      category: true,
      supplier: true,
      balances: { include: { warehouse: true } },
    },
    orderBy: { name: "asc" },
  });

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "produto", label: "Produto" },
    { key: "categoria", label: "Categoria" },
    { key: "deposito", label: "Depósito" },
    { key: "local", label: "Localização" },
    { key: "quantidade", label: "Quantidade", kind: "number" },
    { key: "minimo", label: "Mínimo", kind: "number" },
    { key: "unidade", label: "Unidade" },
  ];
  if (filters.financial) {
    columns.push(
      { key: "custo", label: "Custo", kind: "money" },
      { key: "venda", label: "Preço", kind: "money" },
      { key: "total", label: "Valor em estoque", kind: "money" },
    );
  }

  const rows: Record<string, string | number>[] = [];
  for (const product of products) {
    const lines =
      id === "inventario"
        ? product.balances.map((balance) => ({
            warehouse: balance.warehouse.name,
            quantity: balance.quantity,
          }))
        : [{ warehouse: "Todos", quantity: totalOf(product.balances) }];
    if (id === "inventario" && lines.length === 0) lines.push({ warehouse: "—", quantity: 0 });
    for (const line of lines) {
      const quantity = line.quantity;
      if (id === "abaixo-minimo" && !(quantity > 0 && quantity < product.minStock)) continue;
      if (id === "sem-estoque" && quantity !== 0) continue;
      const row: Record<string, string | number> = {
        sku: product.sku,
        produto: product.name,
        categoria: product.category.name,
        deposito: line.warehouse,
        local: product.location || "—",
        quantidade: quantity,
        minimo: product.minStock,
        unidade: product.unit,
      };
      if (filters.financial) {
        row.custo = product.unitCost;
        row.venda = product.salePrice ?? 0;
        row.total = quantity * product.unitCost;
      }
      rows.push(row);
    }
  }

  return { title, description: "Posição consultada agora.", columns, rows };
}

async function movementReport(
  id: Extract<ReportId, "entradas" | "saidas" | "movimentacoes">,
  title: string,
  filters: Filters,
): Promise<ReportData> {
  const types: MovementType[] =
    id === "entradas" ? ["ENTRY"] : id === "saidas" ? ["EXIT"] : ["ENTRY", "EXIT", "ADJUSTMENT", "TRANSFER", "REVERSAL"];
  const movements = await prisma.movement.findMany({
    where: {
      type: { in: types },
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: startOfDay(filters.from) } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    },
    include: { product: true, user: true, warehouse: true, supplier: true },
    orderBy: { occurredAt: "desc" },
    take: 2000,
  });

  const columns: ReportColumn[] = [
    { key: "data", label: "Data" },
    { key: "tipo", label: "Tipo" },
    { key: "sku", label: "SKU" },
    { key: "produto", label: "Produto" },
    { key: "quantidade", label: "Quantidade", kind: "number" },
    { key: "antes", label: "Anterior", kind: "number" },
    { key: "depois", label: "Posterior", kind: "number" },
    { key: "deposito", label: "Depósito" },
    { key: "usuario", label: "Responsável" },
    { key: "motivo", label: "Justificativa" },
    { key: "origem", label: "Origem" },
  ];

  return {
    title,
    description: periodLabel(filters),
    columns,
    rows: movements.map((movement) => ({
      data: formatDateTime(movement.occurredAt),
      tipo: movementTitle(movement.type, movement.effect),
      sku: movement.product.sku,
      produto: movement.product.name,
      quantidade: movement.quantity,
      antes: movement.quantityBefore,
      depois: movement.quantityAfter,
      deposito: movement.warehouse.name,
      usuario: movement.user.name,
      motivo: movement.reason || movement.notes || movement.destination || "—",
      origem: movement.origin,
    })),
  };
}

async function topReport(title: string, filters: Filters): Promise<ReportData> {
  const movements = await prisma.movement.findMany({
    where: {
      type: { in: ["ENTRY", "EXIT", "TRANSFER"] },
      ...(filters.from || filters.to
        ? {
            occurredAt: {
              ...(filters.from ? { gte: startOfDay(filters.from) } : {}),
              ...(filters.to ? { lte: endOfDay(filters.to) } : {}),
            },
          }
        : {}),
      ...(filters.categoryId ? { product: { categoryId: filters.categoryId } } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
    },
    include: { product: { include: { category: true } } },
  });
  const map = new Map<string, { name: string; sku: string; category: string; count: number; quantity: number }>();
  for (const movement of movements) {
    const current = map.get(movement.productId) ?? {
      name: movement.product.name,
      sku: movement.product.sku,
      category: movement.product.category.name,
      count: 0,
      quantity: 0,
    };
    current.count += 1;
    current.quantity += movement.quantity;
    map.set(movement.productId, current);
  }
  const rows = [...map.values()]
    .sort((a, b) => b.quantity - a.quantity)
    .map((item) => ({
      sku: item.sku,
      produto: item.name,
      categoria: item.category,
      movimentacoes: item.count,
      quantidade: item.quantity,
    }));
  return {
    title,
    description: periodLabel(filters),
    columns: [
      { key: "sku", label: "SKU" },
      { key: "produto", label: "Produto" },
      { key: "categoria", label: "Categoria" },
      { key: "movimentacoes", label: "Movimentações", kind: "number" },
      { key: "quantidade", label: "Quantidade", kind: "number" },
    ],
    rows,
  };
}

export function displayCell(value: string | number, kind?: ReportColumn["kind"]) {
  if (kind === "money" && typeof value === "number") return formatBRL(value);
  if (kind === "number" && typeof value === "number") return new Intl.NumberFormat("pt-BR").format(value);
  return String(value);
}
