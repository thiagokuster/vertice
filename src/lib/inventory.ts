import type { Prisma, Product, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { isLotExpired } from "@/lib/format";
import { getSettings, type AppSettings } from "@/lib/settings";

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

type Tx = Prisma.TransactionClient;

type Actor = {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
};

type LotSlice = {
  lotCode: string;
  expiryDate: string | null;
  quantity: number;
};

export type MovementResult = {
  duplicate: boolean;
  movementId: string;
  detail?: string;
};

function assertQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new InventoryError("Informe uma quantidade inteira entre 1 e 1.000.000.");
  }
}

async function getOrCreateBalance(tx: Tx, productId: string, warehouseId: string) {
  const found = await tx.stockBalance.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  if (found) return found;
  return tx.stockBalance.create({
    data: { productId, warehouseId, quantity: 0 },
  });
}

async function addLot(
  tx: Tx,
  input: {
    productId: string;
    warehouseId: string;
    quantity: number;
    lotCode: string;
    expiryDate: Date | null;
  },
) {
  const existing = await tx.stockLot.findFirst({
    where: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      lotCode: input.lotCode,
      expiryDate: input.expiryDate,
    },
  });
  if (existing) {
    await tx.stockLot.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + input.quantity },
    });
    return;
  }
  await tx.stockLot.create({ data: input });
}

function compareLots(a: { expiryDate: Date | null; createdAt: Date }, b: { expiryDate: Date | null; createdAt: Date }) {
  if (!a.expiryDate && !b.expiryDate) return a.createdAt.getTime() - b.createdAt.getTime();
  if (!a.expiryDate) return 1;
  if (!b.expiryDate) return -1;
  return a.expiryDate.getTime() - b.expiryDate.getTime();
}

function sellableQuantity(balance: number, lots: { quantity: number; expiryDate: Date | null }[]) {
  let usable = 0;
  let expired = 0;
  for (const lot of lots) {
    if (isLotExpired(lot.expiryDate)) expired += lot.quantity;
    else usable += lot.quantity;
  }
  const uncovered = balance - usable - expired;
  return { usable, expired, sellable: usable + Math.max(0, uncovered) };
}

function describeConsumption(slices: LotSlice[]) {
  if (!slices.length) return undefined;
  const parts = slices.map((slice) => {
    const code = slice.lotCode || "sem código";
    if (!slice.expiryDate) return `${code} (${slice.quantity})`;
    const date = new Date(slice.expiryDate);
    const label = `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
    return `${code} (${slice.quantity}, val. ${label})`;
  });
  return `Lote que vence primeiro: ${parts.join(", ")}.`;
}

async function consumeLots(tx: Tx, productId: string, warehouseId: string, quantity: number, skipExpired = false) {
  const lots = await tx.stockLot.findMany({
    where: { productId, warehouseId, quantity: { gt: 0 } },
  });
  const pool = skipExpired ? lots.filter((lot) => !isLotExpired(lot.expiryDate)) : lots;
  const sorted = [...pool].sort(compareLots);
  const consumed: LotSlice[] = [];
  let remaining = quantity;
  for (const lot of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantity, remaining);
    await tx.stockLot.update({
      where: { id: lot.id },
      data: { quantity: lot.quantity - take },
    });
    consumed.push({
      lotCode: lot.lotCode,
      expiryDate: lot.expiryDate?.toISOString() ?? null,
      quantity: take,
    });
    remaining -= take;
  }
  return consumed;
}

async function applySlices(tx: Tx, productId: string, warehouseId: string, effect: number, snapshot: LotSlice[] | null) {
  if (effect > 0) {
    if (snapshot?.length) {
      for (const slice of snapshot) {
        await addLot(tx, {
          productId,
          warehouseId,
          quantity: slice.quantity,
          lotCode: slice.lotCode,
          expiryDate: slice.expiryDate ? new Date(slice.expiryDate) : null,
        });
      }
      return;
    }
    await addLot(tx, {
      productId,
      warehouseId,
      quantity: effect,
      lotCode: "ESTORNO",
      expiryDate: null,
    });
    return;
  }
  await consumeLots(tx, productId, warehouseId, Math.abs(effect));
}

async function idsByRoles(tx: Tx, roles: Role[]) {
  const users = await tx.user.findMany({
    where: { active: true, role: { in: roles } },
    select: { id: true },
  });
  return users.map((user) => user.id);
}

async function push(
  tx: Tx,
  userIds: string[],
  data: { type: string; title: string; body: string; href?: string },
) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  await tx.notification.createMany({
    data: ids.map((userId) => ({
      userId,
      type: data.type,
      title: data.title,
      body: data.body,
      href: data.href ?? null,
    })),
  });
}

async function reviewThresholds(tx: Tx, product: Product, effect: number) {
  const aggregate = await tx.stockBalance.aggregate({
    where: { productId: product.id },
    _sum: { quantity: true },
  });
  const totalAfter = aggregate._sum.quantity ?? 0;
  const totalBefore = totalAfter - effect;
  const recipients = await idsByRoles(tx, ["ADMIN", "OPERATOR"]);
  if (totalBefore > 0 && totalAfter === 0) {
    await push(tx, recipients, {
      type: "OUT_OF_STOCK",
      title: "Produto sem estoque",
      body: `${product.name} ficou sem saldo.`,
      href: `/produtos/${product.id}`,
    });
  } else if (product.minStock > 0 && totalBefore >= product.minStock && totalAfter < product.minStock) {
    await push(tx, recipients, {
      type: "LOW_STOCK",
      title: "Estoque abaixo do mínimo",
      body: `${product.name} está com ${totalAfter} ${product.unit}. O mínimo é ${product.minStock}.`,
      href: `/produtos/${product.id}`,
    });
  } else if (
    product.maxStock != null &&
    totalBefore <= product.maxStock &&
    totalAfter > product.maxStock
  ) {
    await push(tx, recipients, {
      type: "OVER_STOCK",
      title: "Estoque acima do máximo",
      body: `${product.name} ultrapassou o máximo de ${product.maxStock} ${product.unit}.`,
      href: `/produtos/${product.id}`,
    });
  }
}

async function requireProduct(tx: Tx, productId: string, allowInactive = false) {
  const product = await tx.product.findUnique({ where: { id: productId } });
  if (!product) throw new InventoryError("Produto não encontrado.");
  if (!allowInactive && !product.active) {
    throw new InventoryError("Produto inativo. Reative o cadastro antes de movimentar.");
  }
  return product;
}

async function requireWarehouse(tx: Tx, warehouseId: string) {
  const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId } });
  if (!warehouse || !warehouse.active) throw new InventoryError("Depósito inválido ou inativo.");
  return warehouse;
}

async function existingKey(tx: Tx, idempotencyKey: string) {
  return tx.movement.findUnique({ where: { idempotencyKey } });
}

export async function registerEntry(input: {
  actor: Actor;
  productId: string;
  warehouseId: string;
  quantity: number;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  notes?: string | null;
  lotCode?: string | null;
  expiryDate?: Date | null;
  occurredAt: Date;
  idempotencyKey: string;
}) {
  assertQuantity(input.quantity);
  return prisma.$transaction(async (tx) => {
    const existing = await existingKey(tx, input.idempotencyKey);
    if (existing) return { duplicate: true, movementId: existing.id };
    const product = await requireProduct(tx, input.productId);
    if (product.trackExpiry && !input.expiryDate) {
      throw new InventoryError("Informe a data de validade deste produto.");
    }
    const warehouse = await requireWarehouse(tx, input.warehouseId);
    if (input.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || !supplier.active) throw new InventoryError("Fornecedor inválido ou inativo.");
    }
    const balance = await getOrCreateBalance(tx, product.id, warehouse.id);
    const before = balance.quantity;
    const after = before + input.quantity;
    await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: after } });
    const slice: LotSlice = {
      lotCode: input.lotCode?.trim() || "",
      expiryDate: input.expiryDate?.toISOString() ?? null,
      quantity: input.quantity,
    };
    await addLot(tx, {
      productId: product.id,
      warehouseId: warehouse.id,
      quantity: input.quantity,
      lotCode: slice.lotCode,
      expiryDate: input.expiryDate ?? null,
    });
    const movement = await tx.movement.create({
      data: {
        type: "ENTRY",
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: input.quantity,
        effect: input.quantity,
        quantityBefore: before,
        quantityAfter: after,
        userId: input.actor.userId,
        supplierId: input.supplierId || null,
        invoiceNumber: input.invoiceNumber || null,
        notes: input.notes || null,
        origin: "Entrada de mercadoria",
        lotSnapshot: JSON.stringify([slice]),
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
      },
    });
    await reviewThresholds(tx, product, input.quantity);
    await push(tx, [input.actor.userId], {
      type: "ENTRY",
      title: "Entrada registrada",
      body: `${input.quantity} ${product.unit} de ${product.name} em ${warehouse.name}.`,
      href: "/movimentacoes",
    });
    await writeAudit(tx, {
      userId: input.actor.userId,
      action: "STOCK_ENTRY",
      entity: "Movement",
      entityId: movement.id,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
      metadata: { sku: product.sku, quantity: input.quantity, warehouse: warehouse.code },
    });
    return { duplicate: false, movementId: movement.id };
  });
}

export async function registerExit(input: {
  actor: Actor;
  productId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  destination?: string | null;
  notes?: string | null;
  occurredAt: Date;
  idempotencyKey: string;
  settings?: AppSettings;
}) {
  assertQuantity(input.quantity);
  const settings = input.settings ?? (await getSettings());
  return prisma.$transaction(async (tx) => {
    const existing = await existingKey(tx, input.idempotencyKey);
    if (existing) return { duplicate: true, movementId: existing.id };
    const product = await requireProduct(tx, input.productId, true);
    const warehouse = await requireWarehouse(tx, input.warehouseId);
    const balance = await getOrCreateBalance(tx, product.id, warehouse.id);
    const openLots = await tx.stockLot.findMany({
      where: { productId: product.id, warehouseId: warehouse.id, quantity: { gt: 0 } },
    });
    const availability = sellableQuantity(balance.quantity, openLots);
    if (input.quantity > availability.sellable) {
      throw new InventoryError(
        availability.expired > 0
          ? `Não é possível retirar lote vencido em ${warehouse.name}. Disponível: ${availability.sellable} ${product.unit}. Vencido e bloqueado: ${availability.expired} ${product.unit}.`
          : `Estoque insuficiente em ${warehouse.name}. Disponível: ${balance.quantity} ${product.unit}.`,
      );
    }
    const before = balance.quantity;
    const after = before - input.quantity;
    await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: after } });
    const consumed = await consumeLots(tx, product.id, warehouse.id, input.quantity, true);
    const movement = await tx.movement.create({
      data: {
        type: "EXIT",
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: input.quantity,
        effect: -input.quantity,
        quantityBefore: before,
        quantityAfter: after,
        userId: input.actor.userId,
        reason: input.reason,
        destination: input.destination || null,
        notes: input.notes || null,
        origin: "Saída de mercadoria",
        lotSnapshot: JSON.stringify(consumed),
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
      },
    });
    const suspicious =
      (before > 0 && (input.quantity / before) * 100 >= settings.suspiciousPercent) ||
      input.quantity >= settings.suspiciousQuantity;
    await reviewThresholds(tx, product, -input.quantity);
    await push(tx, [input.actor.userId], {
      type: "EXIT",
      title: "Saída registrada",
      body: `${input.quantity} ${product.unit} de ${product.name} retirados de ${warehouse.name}.`,
      href: "/movimentacoes",
    });
    if (suspicious) {
      const admins = await idsByRoles(tx, ["ADMIN"]);
      await push(tx, admins, {
        type: "SUSPICIOUS",
        title: "Movimentação suspeita",
        body: `Saída de ${input.quantity} ${product.unit} de ${product.name} (${before} → ${after}).`,
        href: "/movimentacoes",
      });
      await writeAudit(tx, {
        userId: input.actor.userId,
        action: "SUSPICIOUS_MOVEMENT",
        entity: "Movement",
        entityId: movement.id,
        ip: input.actor.ip,
        userAgent: input.actor.userAgent,
        metadata: { sku: product.sku, quantity: input.quantity, before, after },
      });
    }
    await writeAudit(tx, {
      userId: input.actor.userId,
      action: "STOCK_EXIT",
      entity: "Movement",
      entityId: movement.id,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
      metadata: { sku: product.sku, quantity: input.quantity, warehouse: warehouse.code, suspicious },
    });
    return { duplicate: false, movementId: movement.id, detail: describeConsumption(consumed) };
  });
}

export async function registerTransfer(input: {
  actor: Actor;
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  notes?: string | null;
  occurredAt: Date;
  idempotencyKey: string;
}) {
  assertQuantity(input.quantity);
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new InventoryError("Escolha depósitos de origem e destino diferentes.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await existingKey(tx, input.idempotencyKey);
    if (existing) return { duplicate: true, movementId: existing.id };
    const product = await requireProduct(tx, input.productId);
    const from = await requireWarehouse(tx, input.fromWarehouseId);
    const to = await requireWarehouse(tx, input.toWarehouseId);
    const source = await getOrCreateBalance(tx, product.id, from.id);
    if (source.quantity < input.quantity) {
      throw new InventoryError(
        `Estoque insuficiente em ${from.name}. Disponível: ${source.quantity} ${product.unit}.`,
      );
    }
    const destination = await getOrCreateBalance(tx, product.id, to.id);
    const sourceBefore = source.quantity;
    const sourceAfter = sourceBefore - input.quantity;
    const destinationBefore = destination.quantity;
    const destinationAfter = destinationBefore + input.quantity;
    await tx.stockBalance.update({ where: { id: source.id }, data: { quantity: sourceAfter } });
    await tx.stockBalance.update({ where: { id: destination.id }, data: { quantity: destinationAfter } });
    const consumed = await consumeLots(tx, product.id, from.id, input.quantity);
    for (const slice of consumed) {
      await addLot(tx, {
        productId: product.id,
        warehouseId: to.id,
        quantity: slice.quantity,
        lotCode: slice.lotCode,
        expiryDate: slice.expiryDate ? new Date(slice.expiryDate) : null,
      });
    }
    const groupId = crypto.randomUUID();
    const snapshot = JSON.stringify(consumed);
    const outgoing = await tx.movement.create({
      data: {
        type: "TRANSFER",
        productId: product.id,
        warehouseId: from.id,
        relatedWarehouseId: to.id,
        quantity: input.quantity,
        effect: -input.quantity,
        quantityBefore: sourceBefore,
        quantityAfter: sourceAfter,
        userId: input.actor.userId,
        notes: input.notes || null,
        destination: to.name,
        origin: "Transferência entre depósitos",
        lotSnapshot: snapshot,
        groupId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
      },
    });
    await tx.movement.create({
      data: {
        type: "TRANSFER",
        productId: product.id,
        warehouseId: to.id,
        relatedWarehouseId: from.id,
        quantity: input.quantity,
        effect: input.quantity,
        quantityBefore: destinationBefore,
        quantityAfter: destinationAfter,
        userId: input.actor.userId,
        notes: input.notes || null,
        destination: from.name,
        origin: "Transferência entre depósitos",
        lotSnapshot: snapshot,
        groupId,
        occurredAt: input.occurredAt,
      },
    });
    await push(tx, [input.actor.userId], {
      type: "TRANSFER",
      title: "Transferência registrada",
      body: `${input.quantity} ${product.unit} de ${product.name}: ${from.name} → ${to.name}.`,
      href: "/movimentacoes",
    });
    await writeAudit(tx, {
      userId: input.actor.userId,
      action: "STOCK_TRANSFER",
      entity: "Movement",
      entityId: outgoing.id,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
      metadata: { sku: product.sku, quantity: input.quantity, from: from.code, to: to.code },
    });
    return { duplicate: false, movementId: outgoing.id };
  });
}

export async function registerAdjustment(input: {
  actor: Actor;
  productId: string;
  warehouseId: string;
  newQuantity: number;
  reason: string;
  idempotencyKey: string;
}) {
  if (!Number.isInteger(input.newQuantity) || input.newQuantity < 0 || input.newQuantity > 1_000_000) {
    throw new InventoryError("A nova quantidade deve ser um inteiro entre 0 e 1.000.000.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await existingKey(tx, input.idempotencyKey);
    if (existing) return { duplicate: true, movementId: existing.id };
    const product = await requireProduct(tx, input.productId, true);
    const warehouse = await requireWarehouse(tx, input.warehouseId);
    const balance = await getOrCreateBalance(tx, product.id, warehouse.id);
    const before = balance.quantity;
    const effect = input.newQuantity - before;
    if (effect === 0) throw new InventoryError("A quantidade informada é igual ao saldo atual.");
    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: input.newQuantity },
    });
    let snapshot: LotSlice[] = [];
    if (effect > 0) {
      snapshot = [{ lotCode: "AJUSTE", expiryDate: null, quantity: effect }];
      await addLot(tx, {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: effect,
        lotCode: "AJUSTE",
        expiryDate: null,
      });
    } else {
      snapshot = await consumeLots(tx, product.id, warehouse.id, Math.abs(effect));
    }
    const movement = await tx.movement.create({
      data: {
        type: "ADJUSTMENT",
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: Math.abs(effect),
        effect,
        quantityBefore: before,
        quantityAfter: input.newQuantity,
        userId: input.actor.userId,
        reason: input.reason,
        origin: "Ajuste manual",
        lotSnapshot: JSON.stringify(snapshot),
        idempotencyKey: input.idempotencyKey,
        occurredAt: new Date(),
      },
    });
    await reviewThresholds(tx, product, effect);
    const admins = await idsByRoles(tx, ["ADMIN"]);
    await push(tx, admins, {
      type: "ADJUSTMENT",
      title: "Ajuste de estoque",
      body: `${product.name} em ${warehouse.name}: ${before} → ${input.newQuantity}.`,
      href: "/movimentacoes",
    });
    await writeAudit(tx, {
      userId: input.actor.userId,
      action: "STOCK_ADJUSTMENT",
      entity: "Movement",
      entityId: movement.id,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
      metadata: { sku: product.sku, before, after: input.newQuantity, reason: input.reason },
    });
    return { duplicate: false, movementId: movement.id };
  });
}

export async function reverseMovement(input: {
  actor: Actor;
  movementId: string;
  reason: string;
  idempotencyKey: string;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await existingKey(tx, input.idempotencyKey);
    if (existing) return { duplicate: true, movementId: existing.id };
    const original = await tx.movement.findUnique({
      where: { id: input.movementId },
      include: { product: true },
    });
    if (!original) throw new InventoryError("Movimentação não encontrada.");
    if (original.type === "REVERSAL") {
      throw new InventoryError("Um estorno não pode ser estornado. Use a movimentação original.");
    }
    const legs = original.groupId
      ? await tx.movement.findMany({ where: { groupId: original.groupId, type: { not: "REVERSAL" } } })
      : [original];
    for (const leg of legs) {
      const reversed = await tx.movement.findFirst({ where: { reversalOfId: leg.id } });
      if (reversed) throw new InventoryError("Esta movimentação já foi estornada.");
    }
    const groupId = legs.length > 1 ? crypto.randomUUID() : null;
    let firstId = "";
    for (const [index, leg] of legs.entries()) {
      const effect = -leg.effect;
      const balance = await getOrCreateBalance(tx, leg.productId, leg.warehouseId);
      const before = balance.quantity;
      const after = before + effect;
      if (after < 0) {
        throw new InventoryError("Estoque insuficiente para estornar esta movimentação.");
      }
      await tx.stockBalance.update({ where: { id: balance.id }, data: { quantity: after } });
      const snapshot = leg.lotSnapshot ? (JSON.parse(leg.lotSnapshot) as LotSlice[]) : null;
      await applySlices(tx, leg.productId, leg.warehouseId, effect, snapshot);
      const movement = await tx.movement.create({
        data: {
          type: "REVERSAL",
          productId: leg.productId,
          warehouseId: leg.warehouseId,
          relatedWarehouseId: leg.relatedWarehouseId,
          quantity: Math.abs(effect),
          effect,
          quantityBefore: before,
          quantityAfter: after,
          userId: input.actor.userId,
          reason: input.reason,
          origin: "Estorno",
          lotSnapshot: leg.lotSnapshot,
          groupId,
          reversalOfId: leg.id,
          idempotencyKey: index === 0 ? input.idempotencyKey : null,
          occurredAt: new Date(),
        },
      });
      if (index === 0) firstId = movement.id;
    }
    await reviewThresholds(tx, original.product, legs.reduce((sum, leg) => sum + -leg.effect, 0));
    await writeAudit(tx, {
      userId: input.actor.userId,
      action: "STOCK_REVERSAL",
      entity: "Movement",
      entityId: firstId,
      ip: input.actor.ip,
      userAgent: input.actor.userAgent,
      metadata: { originalId: original.id, reason: input.reason, sku: original.product.sku },
    });
    return { duplicate: false, movementId: firstId };
  });
}
