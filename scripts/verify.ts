import { prisma } from "../src/lib/prisma";
import { Permission, userCan } from "../src/lib/permissions";
import { registerExit } from "../src/lib/inventory";
import { assertCanDeactivate, assertCanDelete } from "../src/lib/users";

async function main() {
const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
const operator = await prisma.user.findFirstOrThrow({ where: { role: "OPERATOR" } });
const assistant = await prisma.user.findFirstOrThrow({ where: { role: "ASSISTANT" } });

const checks: [string, boolean, boolean][] = [
  ["admin usuários", await userCan(admin, Permission.USERS_MANAGE), true],
  ["admin auditoria", await userCan(admin, Permission.AUDIT_VIEW), true],
  ["padrão usuários", await userCan(operator, Permission.USERS_MANAGE), false],
  ["padrão entrada", await userCan(operator, Permission.STOCK_ENTRY), true],
  ["padrão ajuste", await userCan(operator, Permission.STOCK_ADJUST), false],
  ["padrão exportar", await userCan(operator, Permission.REPORTS_EXPORT), false],
  ["ajudante produtos", await userCan(assistant, Permission.PRODUCTS_VIEW), true],
  ["ajudante criar produto", await userCan(assistant, Permission.PRODUCTS_CREATE), false],
  ["ajudante entrada", await userCan(assistant, Permission.STOCK_ENTRY), false],
  ["ajudante auditoria", await userCan(assistant, Permission.AUDIT_VIEW), false],
  ["ajudante relatórios", await userCan(assistant, Permission.REPORTS_OPERATIONAL), false],
];

let failed = 0;
for (const [label, actual, expected] of checks) {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? "ok" : "ERRO"} ${label}: ${actual}`);
}

const toner = await prisma.product.findUniqueOrThrow({ where: { sku: "TON-HP" } });
const warehouse = await prisma.warehouse.findUniqueOrThrow({ where: { code: "PRINCIPAL" } });
try {
  await registerExit({
    actor: { userId: admin.id },
    productId: toner.id,
    warehouseId: warehouse.id,
    quantity: 5,
    reason: "teste de saldo insuficiente",
    occurredAt: new Date(),
    idempotencyKey: `verify-overstock-${Date.now()}`,
  });
  console.log("ERRO saída acima do saldo foi aceita");
  failed += 1;
} catch (error) {
  console.log("ok saída acima do saldo bloqueada:", error instanceof Error ? error.message : error);
}

try {
  await assertCanDelete(admin.id, admin);
  console.log("ERRO admin excluiu a própria conta");
  failed += 1;
} catch (error) {
  console.log("ok autoexclusão bloqueada:", error instanceof Error ? error.message : error);
}

try {
  await assertCanDeactivate(admin.id, admin);
  console.log("ERRO admin desativou a própria conta");
  failed += 1;
} catch (error) {
  console.log("ok autodesativação bloqueada:", error instanceof Error ? error.message : error);
}

await prisma.$disconnect();
if (failed > 0) process.exit(1);
}

main();
