import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { DELEGABLE, PERMISSION_LABELS, type Permission as PermissionName } from "@/lib/permissions";
import { ROLE_LABEL, SESSION_HOURS } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { saveSettings, setRolePermission } from "@/server/actions/admin";
import { PageHeader, Field } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ConfiguracoesPage() {
  await requirePermission(Permission.SETTINGS_GENERAL);
  const [settings, permissions] = await Promise.all([
    getSettings(),
    prisma.rolePermission.findMany(),
  ]);
  const granted = new Set(permissions.filter((item) => item.granted).map((item) => `${item.role}:${item.permission}`));
  return (
    <div className="space-y-6">
      <PageHeader title="Configurações" description="Parâmetros gerais, segurança, alertas e permissões delegáveis." />
      <Card>
        <CardHeader><CardTitle>Empresa</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSettings} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="section" value="general" />
            <Field label="Nome"><Input name="companyName" defaultValue={settings.companyName} required /></Field>
            <Field label="Documento"><Input name="companyDocument" defaultValue={settings.companyDocument} /></Field>
            <SubmitButton>Salvar</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>A sessão expira em {SESSION_HOURS} horas. Bloquear ou trocar a senha encerra as sessões da conta.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm action={saveSettings} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="section" value="security" />
            <Field label="Tentativas antes do bloqueio"><Input name="maxLoginAttempts" type="number" min={3} max={20} defaultValue={settings.maxLoginAttempts} /></Field>
            <Field label="Minutos de bloqueio"><Input name="lockoutMinutes" type="number" min={1} max={1440} defaultValue={settings.lockoutMinutes} /></Field>
            <SubmitButton>Salvar</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Alertas</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={saveSettings} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="section" value="alerts" />
            <Field label="Avisar validade com antecedência (dias)"><Input name="expiryWarningDays" type="number" defaultValue={settings.expiryWarningDays} /></Field>
            <Field label="Saída suspeita acima de (%) do saldo"><Input name="suspiciousPercent" type="number" defaultValue={settings.suspiciousPercent} /></Field>
            <Field label="Ou quantidade absoluta"><Input name="suspiciousQuantity" type="number" defaultValue={settings.suspiciousQuantity} /></Field>
            <Field label="Alta movimentação (lançamentos em 7 dias)"><Input name="highMovementCount" type="number" defaultValue={settings.highMovementCount} /></Field>
            <SubmitButton>Salvar</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Permissões delegáveis</CardTitle>
          <CardDescription>O administrador mantém o controle total. Estas chaves podem ser ligadas para os outros perfis. Gestão de usuários, auditoria e segurança continuam exclusivas do administrador.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["OPERATOR", "ASSISTANT"] as const).map((role) => (
            <div key={role}>
              <p className="mb-2 font-medium">{ROLE_LABEL[role]}</p>
              <div className="space-y-2">
                {DELEGABLE[role].map((permission) => {
                  const on = granted.has(`${role}:${permission}`);
                  return (
                    <ActionForm key={permission} action={setRolePermission} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                      <input type="hidden" name="role" value={role} />
                      <input type="hidden" name="permission" value={permission} />
                      <input type="hidden" name="granted" value={on ? "false" : "true"} />
                      <span className="text-sm">{PERMISSION_LABELS[permission as PermissionName]}</span>
                      <SubmitButton variant={on ? "outline" : "default"}>{on ? "Revogar" : "Conceder"}</SubmitButton>
                    </ActionForm>
                  );
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
