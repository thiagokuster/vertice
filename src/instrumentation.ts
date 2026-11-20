export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertProductionAuthSecret } = await import("@/lib/secrets");
  assertProductionAuthSecret();
  const { startBackupSchedule } = await import("@/lib/backup");
  startBackupSchedule();
}
