import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getDashboard(user: { id: string; role: Role }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const financial = user.role === "ADMIN";
  const simplified = user.role === "ASSISTANT";

  const [products, categories, balances, monthMovements, recent, chartMovements] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { category: true, balances: true },
    }),
    prisma.category.count({ where: { active: true } }),
    prisma.stockBalance.findMany({ select: { quantity: true, productId: true } }),
    prisma.movement.findMany({
      where: { occurredAt: { gte: monthStart }, type: { in: ["ENTRY", "EXIT"] } },
      select: { type: true, quantity: true, userId: true },
    }),
    prisma.movement.findMany({
      where: simplified ? { userId: user.id } : undefined,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { product: true, user: true, warehouse: true },
    }),
    simplified
      ? Promise.resolve([])
      : prisma.movement.findMany({
          where: { occurredAt: { gte: sixMonthsAgo }, type: { in: ["ENTRY", "EXIT"] } },
          select: { type: true, quantity: true, occurredAt: true, productId: true },
        }),
  ]);

  const qtyByProduct = new Map<string, number>();
  for (const balance of balances) {
    qtyByProduct.set(balance.productId, (qtyByProduct.get(balance.productId) ?? 0) + balance.quantity);
  }

  let stockUnits = 0;
  let stockValue = 0;
  let lowStock = 0;
  let outOfStock = 0;
  const categoryUnits = new Map<string, number>();
  const lowList: { id: string; name: string; sku: string; quantity: number; minStock: number; location: string | null }[] = [];

  for (const product of products) {
    const quantity = qtyByProduct.get(product.id) ?? 0;
    stockUnits += quantity;
    stockValue += quantity * product.unitCost;
    categoryUnits.set(product.category.name, (categoryUnits.get(product.category.name) ?? 0) + quantity);
    if (quantity === 0) outOfStock += 1;
    else if (quantity < product.minStock) {
      lowStock += 1;
      lowList.push({
        id: product.id,
        name: product.name,
        sku: product.sku,
        quantity,
        minStock: product.minStock,
        location: product.location,
      });
    }
  }

  const entriesMonth = monthMovements
    .filter((item) => item.type === "ENTRY" && (!simplified || item.userId === user.id))
    .reduce((sum, item) => sum + item.quantity, 0);
  const exitsMonth = monthMovements
    .filter((item) => item.type === "EXIT" && (!simplified || item.userId === user.id))
    .reduce((sum, item) => sum + item.quantity, 0);

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    return {
      key,
      month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
      entradas: 0,
      saidas: 0,
    };
  });
  const monthIndex = new Map(months.map((item) => [item.key, item]));
  const moved = new Map<string, number>();
  for (const movement of chartMovements) {
    const key = `${movement.occurredAt.getFullYear()}-${movement.occurredAt.getMonth()}`;
    const bucket = monthIndex.get(key);
    if (bucket) {
      if (movement.type === "ENTRY") bucket.entradas += movement.quantity;
      if (movement.type === "EXIT") bucket.saidas += movement.quantity;
    }
    moved.set(movement.productId, (moved.get(movement.productId) ?? 0) + movement.quantity);
  }

  const names = new Map(products.map((product) => [product.id, product.name]));
  const top = [...moved.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, quantity]) => ({ name: names.get(id) ?? "Produto", quantity }));

  return {
    simplified,
    financial,
    products: products.length,
    categories,
    stockUnits,
    stockValue: financial ? stockValue : null,
    lowStock,
    outOfStock,
    entriesMonth: simplified ? null : entriesMonth,
    exitsMonth: simplified ? null : exitsMonth,
    recent,
    series: simplified ? [] : months,
    categoriesChart: simplified
      ? []
      : [...categoryUnits.entries()].map(([name, value]) => ({ name, value })),
    lowList: lowList.slice(0, 6),
    top,
  };
}
