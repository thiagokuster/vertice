import { backupDatabase } from "../src/lib/backup";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await backupDatabase();
  if (!result.ok) {
    console.log("ERRO", result.message);
    process.exitCode = 1;
  } else {
    console.log("ok backup", result.file);
  }
  await prisma.$disconnect();
}

main();
