"use server";

import { Permission } from "@/lib/permissions";
import { assertPermission } from "@/lib/session";
import { getRequestMeta } from "@/lib/http";
import {
  registerAdjustment,
  registerEntry,
  registerExit,
  registerTransfer,
  reverseMovement,
} from "@/lib/inventory";
import { clean, optionalText, requiredText, businessDate, businessDateTime, integerField } from "@/lib/validators";
import { fail, refreshViews, type ActionResult } from "@/server/result";

function text(formData: FormData, key: string) {
  return clean(formData.get(key));
}

export async function createEntry(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.STOCK_ENTRY);
  if (!gate.ok) return gate;
  try {
    const meta = await getRequestMeta();
    const result = await registerEntry({
      actor: { userId: gate.user.id, ...meta },
      productId: requiredText(text(formData, "productId"), 1, 80, "O produto"),
      warehouseId: requiredText(text(formData, "warehouseId"), 1, 80, "O depósito"),
      quantity: integerField(text(formData, "quantity"), "A quantidade", 1, 1_000_000),
      supplierId: text(formData, "supplierId") || null,
      invoiceNumber: optionalText(text(formData, "invoiceNumber"), 40, "A nota fiscal"),
      notes: optionalText(text(formData, "notes"), 500, "As observações"),
      lotCode: optionalText(text(formData, "lotCode"), 40, "O lote"),
      expiryDate: text(formData, "expiryDate") ? businessDate(text(formData, "expiryDate"), "A validade") : null,
      occurredAt: businessDate(text(formData, "occurredAt"), "A data da entrada"),
      idempotencyKey: requiredText(text(formData, "idempotencyKey"), 8, 80, "A chave da operação"),
    });
    refreshViews();
    return {
      ok: true,
      message: result.duplicate ? "Esta entrada já tinha sido registrada." : "Entrada confirmada e saldo atualizado.",
      id: result.movementId,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createExit(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.STOCK_EXIT);
  if (!gate.ok) return gate;
  try {
    const meta = await getRequestMeta();
    const result = await registerExit({
      actor: { userId: gate.user.id, ...meta },
      productId: requiredText(text(formData, "productId"), 1, 80, "O produto"),
      warehouseId: requiredText(text(formData, "warehouseId"), 1, 80, "O depósito"),
      quantity: integerField(text(formData, "quantity"), "A quantidade", 1, 1_000_000),
      reason: requiredText(text(formData, "reason"), 3, 240, "O motivo"),
      destination: optionalText(text(formData, "destination"), 120, "O destino"),
      notes: optionalText(text(formData, "notes"), 500, "As observações"),
      occurredAt: businessDateTime(text(formData, "occurredAt"), "A data da saída"),
      idempotencyKey: requiredText(text(formData, "idempotencyKey"), 8, 80, "A chave da operação"),
    });
    refreshViews();
    return {
      ok: true,
      message: result.duplicate
        ? "Esta saída já tinha sido registrada."
        : `Saída confirmada e saldo atualizado.${result.detail ? ` ${result.detail}` : ""}`,
      id: result.movementId,
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createTransfer(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.STOCK_TRANSFER);
  if (!gate.ok) return gate;
  try {
    const meta = await getRequestMeta();
    const result = await registerTransfer({
      actor: { userId: gate.user.id, ...meta },
      productId: requiredText(text(formData, "productId"), 1, 80, "O produto"),
      fromWarehouseId: requiredText(text(formData, "fromWarehouseId"), 1, 80, "A origem"),
      toWarehouseId: requiredText(text(formData, "toWarehouseId"), 1, 80, "O destino"),
      quantity: integerField(text(formData, "quantity"), "A quantidade", 1, 1_000_000),
      notes: optionalText(text(formData, "notes"), 500, "As observações"),
      occurredAt: businessDate(text(formData, "occurredAt"), "A data"),
      idempotencyKey: requiredText(text(formData, "idempotencyKey"), 8, 80, "A chave da operação"),
    });
    refreshViews();
    return {
      ok: true,
      message: result.duplicate ? "Esta transferência já tinha sido registrada." : "Transferência confirmada.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createAdjustment(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.STOCK_ADJUST);
  if (!gate.ok) return gate;
  try {
    const meta = await getRequestMeta();
    const result = await registerAdjustment({
      actor: { userId: gate.user.id, ...meta },
      productId: requiredText(text(formData, "productId"), 1, 80, "O produto"),
      warehouseId: requiredText(text(formData, "warehouseId"), 1, 80, "O depósito"),
      newQuantity: integerField(text(formData, "newQuantity"), "A nova quantidade", 0, 1_000_000),
      reason: requiredText(text(formData, "reason"), 10, 400, "A justificativa"),
      idempotencyKey: requiredText(text(formData, "idempotencyKey"), 8, 80, "A chave da operação"),
    });
    refreshViews();
    return {
      ok: true,
      message: result.duplicate ? "Este ajuste já tinha sido registrado." : "Ajuste registrado no histórico.",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function createReversal(formData: FormData): Promise<ActionResult> {
  const gate = await assertPermission(Permission.STOCK_ADJUST);
  if (!gate.ok) return gate;
  try {
    const meta = await getRequestMeta();
    const result = await reverseMovement({
      actor: { userId: gate.user.id, ...meta },
      movementId: requiredText(text(formData, "movementId"), 1, 80, "A movimentação"),
      reason: requiredText(text(formData, "reason"), 10, 400, "A justificativa"),
      idempotencyKey: requiredText(text(formData, "idempotencyKey"), 8, 80, "A chave da operação"),
    });
    refreshViews();
    return {
      ok: true,
      message: result.duplicate ? "Este estorno já tinha sido registrado." : "Estorno lançado. O lançamento original foi preservado.",
    };
  } catch (error) {
    return fail(error);
  }
}
