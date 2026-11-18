import { prisma } from "@/lib/prisma";
import { formatDate, startOfToday } from "@/lib/format";
import { getSettings } from "@/lib/settings";

const NOTICE_TYPES = ["LOW_STOCK", "OUT_OF_STOCK", "EXPIRING", "EXPIRED"] as const;

type Notice = {
  type: (typeof NOTICE_TYPES)[number];
  title: string;
  body: string;
  href: string;
};

let syncedAt = 0;

export async function syncOperationalNotifications() {
  if (Date.now() - syncedAt < 10 * 60 * 1000) return;
  syncedAt = Date.now();

  const settings = await getSettings();
  const today = startOfToday();
  const limit = new Date(today);
  limit.setDate(limit.getDate() + settings.expiryWarningDays);
  limit.setHours(23, 59, 59, 999);

  const [users, products, expiredLots, expiringLots] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "OPERATOR"] } },
      select: { id: true },
    }),
    prisma.product.findMany({
      where: { active: true },
      include: { balances: true },
    }),
    prisma.stockLot.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { lt: today } },
      include: { product: true, warehouse: true },
    }),
    prisma.stockLot.findMany({
      where: { quantity: { gt: 0 }, expiryDate: { gte: today, lte: limit } },
      include: { product: true, warehouse: true },
      orderBy: { expiryDate: "asc" },
    }),
  ]);
  if (!users.length) return;

  const notices: Notice[] = [];
  const emptyIds: string[] = [];
  for (const product of products) {
    const quantity = product.balances.reduce((sum, balance) => sum + balance.quantity, 0);
    const href = `/produtos/${product.id}`;
    if (quantity === 0 && product.minStock > 0) emptyIds.push(product.id);
    else if (product.minStock > 0 && quantity > 0 && quantity < product.minStock) {
      notices.push({
        type: "LOW_STOCK",
        title: "Estoque abaixo do mínimo",
        body: `${product.name} está com ${quantity} ${product.unit}. O mínimo é ${product.minStock}.`,
        href,
      });
    }
  }

  if (emptyIds.length) {
    const moved = await prisma.movement.findMany({
      where: { productId: { in: emptyIds } },
      distinct: ["productId"],
      select: { productId: true },
    });
    const movedIds = new Set(moved.map((item) => item.productId));
    for (const product of products) {
      if (!movedIds.has(product.id)) continue;
      notices.push({
        type: "OUT_OF_STOCK",
        title: "Produto sem estoque",
        body: `${product.name} está zerado e o mínimo é ${product.minStock} ${product.unit}.`,
        href: `/produtos/${product.id}`,
      });
    }
  }

  const expiredByProduct = new Map<string, typeof expiredLots>();
  for (const lot of expiredLots) {
    const list = expiredByProduct.get(lot.productId) ?? [];
    list.push(lot);
    expiredByProduct.set(lot.productId, list);
  }
  for (const lots of expiredByProduct.values()) {
    const product = lots[0].product;
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const places = [...new Set(lots.map((lot) => lot.warehouse.name))].join(", ");
    notices.push({
      type: "EXPIRED",
      title: "Lote vencido em estoque",
      body: `${product.name} tem ${quantity} ${product.unit} vencidos em ${places}. A saída desses lotes está bloqueada.`,
      href: `/produtos/${product.id}`,
    });
  }

  const expiringByProduct = new Map<string, typeof expiringLots>();
  for (const lot of expiringLots) {
    const list = expiringByProduct.get(lot.productId) ?? [];
    list.push(lot);
    expiringByProduct.set(lot.productId, list);
  }
  for (const lots of expiringByProduct.values()) {
    const product = lots[0].product;
    const next = lots[0];
    notices.push({
      type: "EXPIRING",
      title: "Validade próxima",
      body: `${product.name} vence em até ${settings.expiryWarningDays} dias. A próxima é ${formatDate(next.expiryDate)} em ${next.warehouse.name}.`,
      href: `/produtos/${product.id}`,
    });
  }
  if (!notices.length) return;

  const recent = await prisma.notification.findMany({
    where: { createdAt: { gte: today }, type: { in: [...NOTICE_TYPES] } },
    select: { userId: true, type: true, href: true },
  });
  const seen = new Set(recent.map((item) => `${item.userId}|${item.type}|${item.href}`));
  const data = users.flatMap((user) =>
    notices
      .filter((notice) => !seen.has(`${user.id}|${notice.type}|${notice.href}`))
      .map((notice) => ({ userId: user.id, ...notice })),
  );
  if (data.length) await prisma.notification.createMany({ data });
}
