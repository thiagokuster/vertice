import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const Permission = {
  DASHBOARD_FULL: "dashboard.full",
  DASHBOARD_OPS: "dashboard.ops",
  DASHBOARD_SIMPLE: "dashboard.simple",
  PRODUCTS_VIEW: "products.view",
  PRODUCTS_CREATE: "products.create",
  PRODUCTS_UPDATE: "products.update",
  PRODUCTS_DELETE: "products.delete",
  CATEGORIES_VIEW: "categories.view",
  CATEGORIES_MANAGE: "categories.manage",
  SUPPLIERS_VIEW: "suppliers.view",
  SUPPLIERS_CREATE: "suppliers.create",
  SUPPLIERS_UPDATE: "suppliers.update",
  SUPPLIERS_DELETE: "suppliers.delete",
  STOCK_ENTRY: "stock.entry",
  STOCK_EXIT: "stock.exit",
  STOCK_ADJUST: "stock.adjust",
  STOCK_TRANSFER: "stock.transfer",
  MOVEMENTS_VIEW_ALL: "movements.view.all",
  MOVEMENTS_VIEW_OWN: "movements.view.own",
  REPORTS_OPERATIONAL: "reports.operational",
  REPORTS_FINANCIAL: "reports.financial",
  REPORTS_EXPORT: "reports.export",
  USERS_MANAGE: "users.manage",
  PERMISSIONS_MANAGE: "permissions.manage",
  AUDIT_VIEW: "audit.view",
  SETTINGS_GENERAL: "settings.general",
  SETTINGS_SECURITY: "settings.security",
  ALERTS_VIEW: "alerts.view",
  ALERTS_CONFIGURE: "alerts.configure",
  WAREHOUSES_VIEW: "warehouses.view",
  WAREHOUSES_MANAGE: "warehouses.manage",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const ALL = Object.values(Permission);

const OPERATOR_FIXED = new Set<Permission>([
  Permission.DASHBOARD_OPS,
  Permission.PRODUCTS_VIEW,
  Permission.PRODUCTS_CREATE,
  Permission.PRODUCTS_UPDATE,
  Permission.PRODUCTS_DELETE,
  Permission.CATEGORIES_VIEW,
  Permission.SUPPLIERS_VIEW,
  Permission.STOCK_ENTRY,
  Permission.STOCK_EXIT,
  Permission.MOVEMENTS_VIEW_ALL,
  Permission.MOVEMENTS_VIEW_OWN,
  Permission.REPORTS_OPERATIONAL,
  Permission.ALERTS_VIEW,
  Permission.WAREHOUSES_VIEW,
]);

const ASSISTANT_FIXED = new Set<Permission>([
  Permission.DASHBOARD_SIMPLE,
  Permission.PRODUCTS_VIEW,
  Permission.CATEGORIES_VIEW,
  Permission.MOVEMENTS_VIEW_OWN,
  Permission.ALERTS_VIEW,
  Permission.WAREHOUSES_VIEW,
]);

export const DELEGABLE: Record<Exclude<Role, "ADMIN">, Permission[]> = {
  OPERATOR: [
    Permission.SUPPLIERS_CREATE,
    Permission.SUPPLIERS_UPDATE,
    Permission.STOCK_ADJUST,
    Permission.STOCK_TRANSFER,
    Permission.REPORTS_EXPORT,
  ],
  ASSISTANT: [Permission.STOCK_ENTRY, Permission.STOCK_EXIT],
};

export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.DASHBOARD_FULL]: "Painel completo",
  [Permission.DASHBOARD_OPS]: "Painel operacional",
  [Permission.DASHBOARD_SIMPLE]: "Painel simplificado",
  [Permission.PRODUCTS_VIEW]: "Visualizar produtos",
  [Permission.PRODUCTS_CREATE]: "Cadastrar produtos",
  [Permission.PRODUCTS_UPDATE]: "Editar produtos",
  [Permission.PRODUCTS_DELETE]: "Excluir produtos sem movimentação",
  [Permission.CATEGORIES_VIEW]: "Visualizar categorias",
  [Permission.CATEGORIES_MANAGE]: "Gerenciar categorias",
  [Permission.SUPPLIERS_VIEW]: "Consultar fornecedores",
  [Permission.SUPPLIERS_CREATE]: "Cadastrar fornecedores",
  [Permission.SUPPLIERS_UPDATE]: "Editar fornecedores",
  [Permission.SUPPLIERS_DELETE]: "Excluir fornecedores",
  [Permission.STOCK_ENTRY]: "Registrar entradas",
  [Permission.STOCK_EXIT]: "Registrar saídas",
  [Permission.STOCK_ADJUST]: "Ajustar estoque e estornar",
  [Permission.STOCK_TRANSFER]: "Transferir entre depósitos",
  [Permission.MOVEMENTS_VIEW_ALL]: "Ver todas as movimentações",
  [Permission.MOVEMENTS_VIEW_OWN]: "Ver as próprias movimentações",
  [Permission.REPORTS_OPERATIONAL]: "Relatórios operacionais",
  [Permission.REPORTS_FINANCIAL]: "Relatórios com valores",
  [Permission.REPORTS_EXPORT]: "Exportar PDF e Excel",
  [Permission.USERS_MANAGE]: "Gerenciar usuários",
  [Permission.PERMISSIONS_MANAGE]: "Alterar permissões",
  [Permission.AUDIT_VIEW]: "Consultar auditoria",
  [Permission.SETTINGS_GENERAL]: "Configurações gerais",
  [Permission.SETTINGS_SECURITY]: "Configurações de segurança",
  [Permission.ALERTS_VIEW]: "Ver alertas",
  [Permission.ALERTS_CONFIGURE]: "Configurar alertas",
  [Permission.WAREHOUSES_VIEW]: "Consultar depósitos",
  [Permission.WAREHOUSES_MANAGE]: "Gerenciar depósitos",
};

const FIXED: Record<Role, Set<Permission>> = {
  ADMIN: new Set(ALL),
  OPERATOR: OPERATOR_FIXED,
  ASSISTANT: ASSISTANT_FIXED,
};

export function isDelegable(role: Role, permission: string) {
  if (role === "ADMIN") return false;
  return DELEGABLE[role].includes(permission as Permission);
}

export async function userCan(user: { role: Role }, permission: Permission) {
  if (user.role === "ADMIN") return true;
  if (isDelegable(user.role, permission)) {
    const row = await prisma.rolePermission.findUnique({
      where: { role_permission: { role: user.role, permission } },
    });
    return row?.granted ?? false;
  }
  return FIXED[user.role].has(permission);
}

export async function listPermissions(user: { role: Role }) {
  const granted: Permission[] = [];
  for (const permission of ALL) {
    if (await userCan(user, permission)) granted.push(permission);
  }
  return granted;
}

export function fixedPermissions(role: Role) {
  return [...FIXED[role]];
}
