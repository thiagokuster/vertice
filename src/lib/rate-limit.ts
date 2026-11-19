import { prisma } from "@/lib/prisma";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export const LOGIN_LIMIT = 10;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export function hitRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  current.count += 1;
  return current.count > limit;
}

export async function tooManyLoginAttempts(email: string, ip: string | null) {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const byEmail = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gte: since } },
  });
  if (byEmail >= LOGIN_LIMIT) return true;
  if (!ip) return false;
  const byIp = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gte: since } },
  });
  return byIp >= LOGIN_LIMIT;
}
