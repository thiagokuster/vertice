import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/domain";
import { InventoryError } from "@/lib/inventory";

export type ActionResult =
  | { ok: true; message: string; id?: string; devLink?: string }
  | { ok: false; message: string };

const PATHS = [
  "/",
  "/produtos",
  "/categorias",
  "/fornecedores",
  "/entradas",
  "/saidas",
  "/transferencias",
  "/ajustes",
  "/movimentacoes",
  "/depositos",
  "/alertas",
  "/relatorios",
  "/usuarios",
  "/auditoria",
  "/configuracoes",
  "/perfil",
];

export function refreshViews(extra?: string) {
  for (const path of PATHS) revalidatePath(path);
  if (extra) revalidatePath(extra);
}

export function fail(error: unknown): ActionResult {
  if (error instanceof InventoryError || error instanceof DomainError) {
    return { ok: false, message: error.message };
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return { ok: false, message: "Já existe um registro com esses dados." };
    if (error.code === "P2003") {
      return { ok: false, message: "Este registro está vinculado a outros dados e não pode ser excluído." };
    }
  }
  console.error(error);
  return { ok: false, message: "Não foi possível concluir a operação." };
}

export function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
