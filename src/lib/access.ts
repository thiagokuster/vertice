export function sessionBlockReason(
  user: { active: boolean; lockedUntil: Date | null; tokenVersion: number } | null,
  tokenVersion: number,
) {
  if (!user) return "missing" as const;
  if (!user.active) return "inactive" as const;
  if (user.lockedUntil && user.lockedUntil > new Date()) return "locked" as const;
  if (user.tokenVersion !== tokenVersion) return "revoked" as const;
  return null;
}
