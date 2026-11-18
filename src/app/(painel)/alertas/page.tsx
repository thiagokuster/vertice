import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { getStockAlerts } from "@/lib/alerts";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/admin";
import { formatDate, formatNumber } from "@/lib/format";
import { PageHeader } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AlertasPage() {
  const user = await requirePermission(Permission.ALERTS_VIEW);
  const [alerts, notifications, operational] = await Promise.all([
    getStockAlerts(),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    userCan(user, Permission.DASHBOARD_OPS),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Alertas" description="Situação atual do estoque e avisos das suas operações." action={<ActionForm action={markAllNotificationsRead}><SubmitButton variant="outline">Marcar avisos como lidos</SubmitButton></ActionForm>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertList title="Abaixo do mínimo" items={alerts.low.map((item) => `${item.name} · ${formatNumber(item.quantity)} / mín. ${formatNumber(item.minStock)} · ${item.location || "sem local"}`)} href="/produtos" />
        <AlertList title="Sem estoque" items={alerts.empty.map((item) => `${item.sku} — ${item.name}`)} href="/produtos" />
        <AlertList title="Acima do máximo" items={alerts.over.map((item) => `${item.name} · ${formatNumber(item.quantity)} / máx. ${formatNumber(item.maxStock ?? 0)}`)} />
        <AlertList title={`Validade em até ${alerts.expiryWarningDays} dias`} items={alerts.expiringLots.map((lot) => `${lot.product.name} · ${lot.warehouse.name} · ${formatDate(lot.expiryDate)}`)} />
        <AlertList title="Produtos vencidos" items={alerts.expiredLots.map((lot) => `${lot.product.name} · ${lot.warehouse.name} · ${formatDate(lot.expiryDate)} · ${formatNumber(lot.quantity)}`)} />
        {operational || user.role === "ADMIN" ? (
          <AlertList title="Alta movimentação (7 dias)" items={alerts.busy.map((item) => `${item.name} · ${item.count} lançamentos`)} />
        ) : null}
      </div>
      <Card>
        <CardHeader><CardTitle>Avisos recebidos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum aviso.</p> : notifications.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-b pb-2 text-sm">
              <div>
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground">{item.body}</p>
              </div>
              {item.readAt ? null : (
                <ActionForm action={markNotificationRead}>
                  <input type="hidden" name="id" value={item.id} />
                  <SubmitButton variant="outline">Lida</SubmitButton>
                </ActionForm>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertList({ title, items, href }: { title: string; items: string[]; href?: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-sm text-muted-foreground">Nada nesta condição.</p> : (
          <ul className="space-y-1 text-sm">
            {items.map((item) => <li key={item}>{href ? <Link href={href}>{item}</Link> : item}</li>)}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
