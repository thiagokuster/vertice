import type { MovementType, Role } from "@prisma/client";

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  OPERATOR: "Padrão",
  ASSISTANT: "Ajudante",
};

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  ENTRY: "Entrada",
  EXIT: "Saída",
  ADJUSTMENT: "Ajuste",
  TRANSFER: "Transferência",
  REVERSAL: "Estorno",
};

export const UNITS = ["UN", "CX", "PC", "KG", "G", "L", "ML", "M", "PAR"] as const;

export const SESSION_HOURS = 8;

export function movementTitle(type: MovementType, effect: number) {
  if (type === "TRANSFER") return effect < 0 ? "Transferência (saída)" : "Transferência (entrada)";
  if (type === "REVERSAL") return effect < 0 ? "Estorno (baixa)" : "Estorno (retorno)";
  if (type === "ADJUSTMENT") return effect < 0 ? "Ajuste (baixa)" : "Ajuste (acréscimo)";
  return MOVEMENT_LABEL[type];
}
