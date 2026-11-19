import { spawn } from "node:child_process";
import { mkdir, readdir, rm, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import { prisma, prepareSqlite } from "@/lib/prisma";

const KEEP = 14;

function stamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function sqliteFile() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.startsWith("file:")) return null;
  const spec = decodeURIComponent(url.slice("file:".length));
  if (spec.startsWith("./") || spec.startsWith(".\\")) return path.resolve(process.cwd(), "prisma", spec.slice(2));
  return path.resolve(spec);
}

async function prune(directory: string) {
  const entries = await readdir(directory);
  const files = await Promise.all(
    entries
      .filter((name) => name.startsWith("vertice-"))
      .map(async (name) => {
        const full = path.join(directory, name);
        const info = await stat(full);
        return { full, mtime: info.mtimeMs };
      }),
  );
  const extra = files.sort((a, b) => b.mtime - a.mtime).slice(KEEP);
  await Promise.all(extra.map((file) => rm(file.full, { force: true })));
}

function dumpPostgres(url: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("pg_dump", ["--dbname", url, "--format", "custom", "--file", destination], { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error("pg_dump não concluiu a cópia."));
    });
  });
}

export async function backupDatabase() {
  const directory = path.resolve(process.cwd(), "backups");
  await mkdir(directory, { recursive: true });
  const sqlite = sqliteFile();
  if (sqlite) {
    await prepareSqlite();
    const destination = path.join(directory, `vertice-${stamp()}.db`);
    const sqlPath = destination.replaceAll("\\", "/").replaceAll("'", "''");
    try {
      await prisma.$executeRawUnsafe(`VACUUM INTO '${sqlPath}'`);
    } catch {
      await prisma.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
      await copyFile(sqlite, destination);
    }
    await prune(directory);
    return { ok: true as const, file: destination };
  }

  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("postgres")) {
    const destination = path.join(directory, `vertice-${stamp()}.dump`);
    await dumpPostgres(url, destination);
    await prune(directory);
    return { ok: true as const, file: destination };
  }
  return { ok: false as const, message: "DATABASE_URL não é SQLite nem PostgreSQL." };
}

const globalBackup = globalThis as unknown as { backupStarted?: boolean };

export function startBackupSchedule() {
  if (globalBackup.backupStarted) return;
  globalBackup.backupStarted = true;
  const run = () => {
    backupDatabase().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "falha desconhecida";
      console.error(`Backup não realizado: ${message}`);
    });
  };
  setTimeout(run, 20_000);
  setInterval(run, 24 * 60 * 60 * 1000);
}
