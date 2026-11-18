import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { Permission, listPermissions } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { syncOperationalNotifications } from "@/lib/notifications";
import { AppShell } from "@/components/shell";

const NAV: { href: string; label: string; group: string; permission?: Permission }[] = [
  { href: "/", label: "Painel", group: "Geral" },
  { href: "/produtos", label: "Produtos", group: "Cadastros", permission: Permission.PRODUCTS_VIEW },
  { href: "/categorias", label: "Categorias", group: "Cadastros", permission: Permission.CATEGORIES_VIEW },
  { href: "/fornecedores", label: "Fornecedores", group: "Cadastros", permission: Permission.SUPPLIERS_VIEW },
  { href: "/depositos", label: "Depósitos", group: "Cadastros", permission: Permission.WAREHOUSES_VIEW },
  { href: "/entradas", label: "Entradas", group: "Operação", permission: Permission.STOCK_ENTRY },
  { href: "/saidas", label: "Saídas", group: "Operação", permission: Permission.STOCK_EXIT },
  { href: "/transferencias", label: "Transferências", group: "Operação", permission: Permission.STOCK_TRANSFER },
  { href: "/ajustes", label: "Ajustes", group: "Operação", permission: Permission.STOCK_ADJUST },
  { href: "/movimentacoes", label: "Movimentações", group: "Operação", permission: Permission.MOVEMENTS_VIEW_OWN },
  { href: "/alertas", label: "Alertas", group: "Análise", permission: Permission.ALERTS_VIEW },
  { href: "/relatorios", label: "Relatórios", group: "Análise", permission: Permission.REPORTS_OPERATIONAL },
  { href: "/usuarios", label: "Usuários", group: "Administração", permission: Permission.USERS_MANAGE },
  { href: "/auditoria", label: "Auditoria", group: "Administração", permission: Permission.AUDIT_VIEW },
  { href: "/configuracoes", label: "Configurações", group: "Administração", permission: Permission.SETTINGS_GENERAL },
];

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await syncOperationalNotifications().catch(() => undefined);
  const [granted, settings, unread] = await Promise.all([
    listPermissions(user),
    getSettings(),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const allowed = new Set(granted);
  const items = NAV.filter((item) => !item.permission || allowed.has(item.permission));
  return (
    <AppShell
      company={settings.companyName}
      userName={user.name}
      roleLabel={ROLE_LABEL[user.role]}
      items={items}
      unread={unread}
      demo={process.env.NODE_ENV === "development"}
    >
      {children}
    </AppShell>
  );
}
