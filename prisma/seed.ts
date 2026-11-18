import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { DELEGABLE } from "../src/lib/permissions";
import { DEFAULT_SETTINGS, SETTING_KEYS } from "../src/lib/settings";
import { registerEntry, registerExit, registerTransfer } from "../src/lib/inventory";

function cnpj(base12: string) {
  const digit = (base: string, factors: number[]) => {
    const sum = factors.reduce((total, factor, index) => total + Number(base[index]) * factor, 0);
    const rest = sum % 11;
    return String(rest < 2 ? 0 : 11 - rest);
  };
  const first = digit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(base12 + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return base12 + first + second;
}

async function ensureUser(input: { name: string; email: string; password: string; role: "ADMIN" | "OPERATOR" | "ASSISTANT" }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await bcrypt.hash(input.password, 12),
    },
  });
}

async function main() {
  const settings: Record<string, string> = {
    [SETTING_KEYS.companyName]: DEFAULT_SETTINGS.companyName,
    [SETTING_KEYS.companyDocument]: DEFAULT_SETTINGS.companyDocument,
    [SETTING_KEYS.expiryWarningDays]: String(DEFAULT_SETTINGS.expiryWarningDays),
    [SETTING_KEYS.suspiciousPercent]: String(DEFAULT_SETTINGS.suspiciousPercent),
    [SETTING_KEYS.suspiciousQuantity]: String(DEFAULT_SETTINGS.suspiciousQuantity),
    [SETTING_KEYS.highMovementCount]: String(DEFAULT_SETTINGS.highMovementCount),
    [SETTING_KEYS.maxLoginAttempts]: String(DEFAULT_SETTINGS.maxLoginAttempts),
    [SETTING_KEYS.lockoutMinutes]: String(DEFAULT_SETTINGS.lockoutMinutes),
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  for (const role of ["OPERATOR", "ASSISTANT"] as const) {
    for (const permission of DELEGABLE[role]) {
      await prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        update: {},
        create: { role, permission, granted: false },
      });
    }
  }

  await prisma.warehouse.upsert({
    where: { code: "PRINCIPAL" },
    update: {},
    create: {
      code: "PRINCIPAL",
      name: "Depósito principal",
      description: "Depósito padrão criado na instalação.",
    },
  });

  const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@estoque.local").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminExists = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!adminExists) {
    if (process.env.NODE_ENV === "production" && !adminPassword) {
      throw new Error("Em produção, defina ADMIN_EMAIL e ADMIN_PASSWORD antes do primeiro acesso.");
    }
    await ensureUser({
      name: "Administrador",
      email: adminEmail,
      password: adminPassword || "Admin@123456",
      role: "ADMIN",
    });
    console.log(`Administrador inicial: ${adminEmail}`);
  }

  const demo = process.env.SEED_DEMO === "true" && process.env.NODE_ENV !== "production";
  if (!demo) return;
  if ((await prisma.product.count()) > 0) {
    console.log("Dados de demonstração já existem. Nada foi duplicado.");
    return;
  }

  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const operator = await ensureUser({
    name: "Camila Operadora",
    email: "operador@estoque.local",
    password: "Operador@123456",
    role: "OPERATOR",
  });
  await ensureUser({
    name: "Rafael Ajudante",
    email: "ajudante@estoque.local",
    password: "Ajudante@123456",
    role: "ASSISTANT",
  });

  const office = await prisma.category.create({ data: { name: "Escritório", description: "Material de expediente" } });
  const it = await prisma.category.create({ data: { name: "Informática", description: "Equipamentos e suprimentos" } });
  const cleaning = await prisma.category.create({ data: { name: "Limpeza", description: "Higienização" } });
  const paper = await prisma.supplier.create({
    data: {
      companyName: "Papelaria Horizonte Ltda",
      cnpj: cnpj("112223330001"),
      phone: "(11) 4000-1000",
      email: "contato@horizonte.example",
      address: "Rua das Acácias, 120, São Paulo",
      contactName: "Helena Prado",
    },
  });
  const tech = await prisma.supplier.create({
    data: {
      companyName: "Norte Suprimentos ME",
      cnpj: cnpj("223334440001"),
      phone: "(11) 4000-2000",
      email: "vendas@norte.example",
      address: "Av. Industrial, 900, Guarulhos",
      contactName: "Paulo Neri",
    },
  });
  const main = await prisma.warehouse.findUniqueOrThrow({ where: { code: "PRINCIPAL" } });
  const branch = await prisma.warehouse.create({
    data: { code: "FILIAL", name: "Depósito da filial", description: "Depósito de demonstração." },
  });

  const soon = new Date();
  soon.setDate(soon.getDate() + 12);
  const products = await prisma.$transaction([
    prisma.product.create({
      data: {
        sku: "PAP-A4",
        name: "Papel sulfite A4",
        categoryId: office.id,
        supplierId: paper.id,
        unit: "CX",
        minStock: 5,
        maxStock: 40,
        unitCost: 2890,
        salePrice: 4200,
        location: "Corredor A / prateleira 1",
      },
    }),
    prisma.product.create({
      data: {
        sku: "CAN-AZ",
        name: "Caneta esferográfica azul",
        categoryId: office.id,
        supplierId: paper.id,
        unit: "UN",
        minStock: 30,
        unitCost: 150,
        salePrice: 350,
        location: "Corredor A / prateleira 2",
      },
    }),
    prisma.product.create({
      data: {
        sku: "TON-HP",
        name: "Toner preto",
        categoryId: it.id,
        supplierId: tech.id,
        unit: "UN",
        minStock: 2,
        unitCost: 18900,
        salePrice: 24900,
        location: "Sala técnica",
      },
    }),
    prisma.product.create({
      data: {
        sku: "ALC-70",
        name: "Álcool 70%",
        categoryId: cleaning.id,
        supplierId: tech.id,
        unit: "UN",
        minStock: 8,
        unitCost: 690,
        salePrice: 1200,
        location: "Copa",
        trackExpiry: true,
      },
    }),
  ]);

  const actor = { userId: admin.id };
  const today = new Date();
  await registerEntry({
    actor,
    productId: products[0].id,
    warehouseId: main.id,
    quantity: 12,
    supplierId: paper.id,
    invoiceNumber: "NF-1044",
    occurredAt: today,
    idempotencyKey: "demo-entry-papel",
  });
  await registerEntry({
    actor: { userId: operator.id },
    productId: products[1].id,
    warehouseId: main.id,
    quantity: 8,
    supplierId: paper.id,
    occurredAt: today,
    idempotencyKey: "demo-entry-caneta",
  });
  await registerEntry({
    actor,
    productId: products[3].id,
    warehouseId: main.id,
    quantity: 10,
    supplierId: tech.id,
    lotCode: "L2026",
    expiryDate: soon,
    occurredAt: today,
    idempotencyKey: "demo-entry-alcool",
  });
  await registerExit({
    actor: { userId: operator.id },
    productId: products[0].id,
    warehouseId: main.id,
    quantity: 2,
    reason: "Reposição do administrativo",
    destination: "Recepção",
    occurredAt: today,
    idempotencyKey: "demo-exit-papel",
  });
  await registerTransfer({
    actor,
    productId: products[0].id,
    fromWarehouseId: main.id,
    toWarehouseId: branch.id,
    quantity: 3,
    occurredAt: today,
    idempotencyKey: "demo-transfer-papel",
  });

  console.log("Dados de demonstração criados. Eles existem só neste ambiente de desenvolvimento.");
  console.log("Admin: admin@estoque.local / Admin@123456");
  console.log("Padrão: operador@estoque.local / Operador@123456");
  console.log("Ajudante: ajudante@estoque.local / Ajudante@123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
