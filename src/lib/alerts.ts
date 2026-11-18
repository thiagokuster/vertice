import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/format";
import { getSettings } from "@/lib/settings";

export async function getStockAlerts() {
  const settings = await getSettings();
  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + settings.expiryWarningDays);
  limit.setHours(23, 59, 59, 999);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [products, grouped, expiredLots, expiringLots] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      include: { balances: true, category: true },
    }),
    prisma.movement.groupBy({
      by: ["productId"],
      where: { occurredAt: { gte: weekAgo } },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.stockLot.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lt: today } },
      include: { product: true, warehouse: true },
      orderBy: { expiryDate: "asc" },
      take: 20,
    }),
    prisma.stockLot.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { gte: today, lte: limit } },
      include: { product: true, warehouse: true },
      orderBy: { expiryDate: "asc" },
      take: 20,
    }),
  ]);

  const low = [];
  const empty = [];
  const over = [];
  for (const product of products) {
    const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
    const item = {
      id: product.id,
      name: product.name,
      sku: product.sku,
      quantity,
      minStock: product.minStock,
      maxStock: product.maxStock,
      unit: product.unit,
      location: product.location,
      category: product.category.name,
    };
    if (quantity === 0) empty.push(item);
    else if (product.minStock > 0 && quantity < product.minStock) low.push(item);
    if (product.maxStock != null && quantity > product.maxStock) over.push(item);
  }

  const names = new Map(products.map((product) => [product.id, product.name]));
  const busy = grouped
    .filter((row) => row._count._all >= settings.highMovementCount)
    .map((row) => ({
      id: row.productId,
      name: names.get(row.productId) ?? "Produto",
      count: row._count._all,
      quantity: row._sum.quantity ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    low,
    empty,
    over,
    expiredLots,
    expiringLots,
    busy,
    expiryWarningDays: settings.expiryWarningDays,
    highMovementCount: settings.highMovementCount,
  };
}
