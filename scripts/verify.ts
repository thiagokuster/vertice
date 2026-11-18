import { prisma } from "../src/lib/prisma";
import { Permission, userCan } from "../src/lib/permissions";
import { InventoryError, registerExit } from "../src/lib/inventory";
import { parseProductCsv } from "../src/lib/csv";
import { removeUpload, saveProductImage } from "../src/lib/files";
import { syncOperationalNotifications } from "../src/lib/notifications";
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

const csv = parseProductCsv("sku;nome;categoria\nAB-1;Item teste;Geral\n");
if (csv.error || csv.rows[0]?.name !== "Item teste") {
  failed += 1;
  console.log("ERRO csv", csv);
} else {
  console.log("ok csv de produtos");
}
const csvMissing = parseProductCsv("nome;categoria\nItem;Geral\n");
if (!csvMissing.error) {
  failed += 1;
  console.log("ERRO csv sem sku foi aceito");
} else {
  console.log("ok csv sem sku recusado");
}

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const imagePath = await saveProductImage(new File([png], "ponto.png", { type: "" }));
await removeUpload(imagePath);
console.log(imagePath.endsWith(".png") ? "ok imagem reconhecida pelo conteúdo" : "ERRO imagem");
if (!imagePath.endsWith(".png")) failed += 1;

const category = await prisma.category.findFirstOrThrow();
const sample = await prisma.product.create({
  data: { sku: "TEST-FEFO", name: "Teste de validade", categoryId: category.id, unit: "UN", trackExpiry: true },
});
const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 2);
yesterday.setHours(12, 0, 0, 0);
const later = new Date();
later.setDate(later.getDate() + 20);
later.setHours(12, 0, 0, 0);
try {
  await prisma.stockBalance.create({ data: { productId: sample.id, warehouseId: warehouse.id, quantity: 5 } });
  await prisma.stockLot.create({
    data: { productId: sample.id, warehouseId: warehouse.id, lotCode: "VELHO", quantity: 3, expiryDate: yesterday },
  });
  await prisma.stockLot.create({
    data: { productId: sample.id, warehouseId: warehouse.id, lotCode: "NOVO", quantity: 2, expiryDate: later },
  });
  try {
    await registerExit({
      actor: { userId: admin.id },
      productId: sample.id,
      warehouseId: warehouse.id,
      quantity: 3,
      reason: "teste de lote vencido",
      occurredAt: new Date(),
      idempotencyKey: `verify-fefo-blocked-${Date.now()}`,
    });
    failed += 1;
    console.log("ERRO saída acima do lote válido passou");
  } catch (error) {
    if (error instanceof InventoryError && error.message.includes("vencido")) {
      console.log("ok saída de lote vencido bloqueada");
    } else {
      failed += 1;
      console.log("ERRO no bloqueio de vencido:", error instanceof Error ? error.message : error);
    }
  }
  const exit = await registerExit({
    actor: { userId: admin.id },
    productId: sample.id,
    warehouseId: warehouse.id,
    quantity: 2,
    reason: "teste fefo",
    occurredAt: new Date(),
    idempotencyKey: `verify-fefo-ok-${Date.now()}`,
  });
  const movement = await prisma.movement.findUniqueOrThrow({ where: { id: exit.movementId } });
  const snapshot = JSON.parse(movement.lotSnapshot ?? "[]") as { lotCode: string; quantity: number }[];
  if (snapshot.length === 1 && snapshot[0].lotCode === "NOVO" && snapshot[0].quantity === 2) {
    console.log("ok saída usou o lote que vence primeiro");
  } else {
    failed += 1;
    console.log("ERRO fefo", snapshot);
  }
  const expiredLeft = await prisma.stockLot.findFirst({ where: { productId: sample.id, lotCode: "VELHO" } });
  if (expiredLeft?.quantity === 3) console.log("ok lote vencido permaneceu no estoque");
  else {
    failed += 1;
    console.log("ERRO lote vencido foi alterado", expiredLeft?.quantity);
  }
} finally {
  await prisma.movement.deleteMany({ where: { productId: sample.id } });
  await prisma.stockLot.deleteMany({ where: { productId: sample.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: sample.id } });
  await prisma.notification.deleteMany({ where: { href: `/produtos/${sample.id}` } });
  await prisma.auditLog.deleteMany({ where: { entityId: sample.id } });
  await prisma.product.delete({ where: { id: sample.id } });
}

await syncOperationalNotifications();
const lowNotice = await prisma.notification.findFirst({ where: { type: "LOW_STOCK" } });
const expiryNotice = await prisma.notification.findFirst({ where: { type: { in: ["EXPIRING", "EXPIRED"] } } });
if (lowNotice) console.log("ok aviso de estoque baixo:", lowNotice.title);
else {
  failed += 1;
  console.log("ERRO nenhum aviso de estoque baixo");
}
if (expiryNotice) console.log("ok aviso de validade:", expiryNotice.title);
else console.log("ok sem lote perto do vencimento neste momento");

await prisma.$disconnect();
if (failed > 0) process.exit(1);
}

main();
