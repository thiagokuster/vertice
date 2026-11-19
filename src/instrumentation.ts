export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startBackupSchedule } = await import("@/lib/backup");
  startBackupSchedule();
}
