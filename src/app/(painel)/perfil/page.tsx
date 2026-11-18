import { requireUser } from "@/lib/session";
import { changeOwnPassword } from "@/server/actions/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { PageHeader, Field } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PerfilPage() {
  const user = await requireUser();
  return (
    <div className="max-w-lg">
      <PageHeader title="Meu acesso" description={`${user.email} · ${ROLE_LABEL[user.role]}`} />
      <Card>
        <CardHeader><CardTitle>Trocar senha</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={changeOwnPassword} className="space-y-3">
            <Field label="Senha atual"><Input name="current" type="password" required /></Field>
            <Field label="Nova senha"><Input name="password" type="password" required /></Field>
            <Field label="Confirmar"><Input name="confirm" type="password" required /></Field>
            <SubmitButton>Atualizar senha</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
