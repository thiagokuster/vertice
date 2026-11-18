export type AppSettings = {
  companyName: string;
  companyDocument: string;
  expiryWarningDays: number;
  suspiciousPercent: number;
  suspiciousQuantity: number;
  highMovementCount: number;
  maxLoginAttempts: number;
  lockoutMinutes: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  companyName: "Minha Empresa",
  companyDocument: "",
  expiryWarningDays: 30,
  suspiciousPercent: 50,
  suspiciousQuantity: 100,
  highMovementCount: 10,
  maxLoginAttempts: 5,
  lockoutMinutes: 15,
};

const KEYS = {
  companyName: "company_name",
  companyDocument: "company_document",
  expiryWarningDays: "expiry_warning_days",
  suspiciousPercent: "suspicious_percent",
  suspiciousQuantity: "suspicious_quantity",
  highMovementCount: "high_movement_count",
  maxLoginAttempts: "max_login_attempts",
  lockoutMinutes: "lockout_minutes",
} as const;

let cache: { at: number; value: AppSettings } | null = null;

function clamp(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export async function getSettings(): Promise<AppSettings> {
  if (cache && Date.now() - cache.at < 3000) return cache.value;
  const { prisma } = await import("@/lib/prisma");
  const rows = await prisma.systemSetting.findMany();
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const value: AppSettings = {
    companyName: map.get(KEYS.companyName) || DEFAULT_SETTINGS.companyName,
    companyDocument: map.get(KEYS.companyDocument) ?? "",
    expiryWarningDays: clamp(map.get(KEYS.expiryWarningDays), 1, 365, DEFAULT_SETTINGS.expiryWarningDays),
    suspiciousPercent: clamp(map.get(KEYS.suspiciousPercent), 1, 100, DEFAULT_SETTINGS.suspiciousPercent),
    suspiciousQuantity: clamp(map.get(KEYS.suspiciousQuantity), 1, 1_000_000, DEFAULT_SETTINGS.suspiciousQuantity),
    highMovementCount: clamp(map.get(KEYS.highMovementCount), 2, 1000, DEFAULT_SETTINGS.highMovementCount),
    maxLoginAttempts: clamp(map.get(KEYS.maxLoginAttempts), 3, 20, DEFAULT_SETTINGS.maxLoginAttempts),
    lockoutMinutes: clamp(map.get(KEYS.lockoutMinutes), 1, 1440, DEFAULT_SETTINGS.lockoutMinutes),
  };
  cache = { at: Date.now(), value };
  return value;
}

export function clearSettingsCache() {
  cache = null;
}

export const SETTING_KEYS = KEYS;
