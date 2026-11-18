import { z } from "zod";
import { isReasonableBusinessDate, parseDateInput, parseDateTimeInput, parseMoneyToCents } from "@/lib/format";
import { DomainError } from "@/lib/domain";

export const passwordSchema = z
  .string()
  .min(8, "A senha deve ter pelo menos 8 caracteres.")
  .regex(/[a-z]/, "A senha deve ter uma letra minúscula.")
  .regex(/[A-Z]/, "A senha deve ter uma letra maiúscula.")
  .regex(/[0-9]/, "A senha deve ter um número.")
  .regex(/[^A-Za-z0-9]/, "A senha deve ter um caractere especial.");

export const emailSchema = z.email("Informe um e-mail válido.");

export function isValidCnpj(value: string) {
  const cnpj = value.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const digit = (base: string, factors: number[]) => {
    const sum = factors.reduce((total, factor, index) => total + Number(base[index]) * factor, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(cnpj[12]) && second === Number(cnpj[13]);
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(value: string, max: number, label: string) {
  if (!value) return null;
  if (value.length > max) {
    throw new DomainError(`${label} deve ter no máximo ${max} caracteres.`);
  }
  return value;
}

export function requiredText(value: string, min: number, max: number, label: string) {
  if (value.length < min) throw new DomainError(`${label} deve ter pelo menos ${min} caracteres.`);
  if (value.length > max) throw new DomainError(`${label} deve ter no máximo ${max} caracteres.`);
  return value;
}

export function moneyField(value: string, label: string, required = false) {
  if (!value) {
    if (required) throw new DomainError(`Informe ${label}.`);
    return null;
  }
  const cents = parseMoneyToCents(value);
  if (cents == null || cents > 1_000_000_000) {
    throw new DomainError(`${label} inválido.`);
  }
  return cents;
}

export function integerField(value: string, label: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) throw new DomainError(`${label} deve ser um número inteiro.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new DomainError(`${label} deve ficar entre ${min} e ${max}.`);
  }
  return parsed;
}

export function businessDate(value: string, label: string) {
  const date = parseDateInput(value);
  if (!date || !isReasonableBusinessDate(date)) {
    throw new DomainError(`${label} inválida.`);
  }
  return date;
}

export function businessDateTime(value: string, label: string) {
  const date = parseDateTimeInput(value);
  if (!date || !isReasonableBusinessDate(date)) {
    throw new DomainError(`${label} inválida.`);
  }
  return date;
}

export function formError(error: unknown) {
  return error instanceof Error ? error.message : "Dados inválidos.";
}
