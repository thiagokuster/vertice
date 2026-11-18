import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { adminResetPassword, createUser, deleteUser, setUserActive, updateUser } from "@/server/actions/admin";
import { ROLE_LABEL } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function UsuariosPage() {
  await requirePermission(Permission.USERS_MANAGE);
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Usuários" description="Somente o administrador cria contas e define o nível de acesso." />
      <div className="space-y-4">
        {users.map((person) => (
          <Card key={person.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {person.name}
                <Badge variant="secondary">{ROLE_LABEL[person.role]}</Badge>
                <Badge variant={person.active ? "outline" : "destructive"}>{person.active ? "Ativo" : "Bloqueado"}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{person.email} · último acesso {formatDateTime(person.lastLoginAt)}</p>
              <ActionForm action={updateUser} className="grid gap-2 md:grid-cols-3">
                <input type="hidden" name="id" value={person.id} />
                <Input name="name" defaultValue={person.name} required />
                <NativeSelect name="role" defaultValue={person.role}>
                  <option value="ADMIN">Administrador</option>
                  <option value="OPERATOR">Padrão</option>
                  <option value="ASSISTANT">Ajudante</option>
                </NativeSelect>
                <SubmitButton>Salvar</SubmitButton>
              </ActionForm>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={setUserActive}>
                  <input type="hidden" name="id" value={person.id} />
                  <input type="hidden" name="active" value={person.active ? "false" : "true"} />
                  <SubmitButton variant="outline">{person.active ? "Desativar" : "Reativar"}</SubmitButton>
                </ActionForm>
                <ConfirmButton action={deleteUser} fields={{ id: person.id }} label="Excluir" title="Excluir usuário" description="Não é possível excluir a própria conta, o último administrador ou quem já tem histórico." />
              </div>
              <ActionForm action={adminResetPassword} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={person.id} />
                <Input name="password" type="password" placeholder="Nova senha" required className="max-w-xs" />
                <SubmitButton variant="outline">Redefinir senha</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle>Novo usuário</CardTitle></CardHeader>
        <CardContent>
          <ActionForm action={createUser} className="grid gap-3 md:grid-cols-2">
            <Field label="Nome"><Input name="name" required /></Field>
            <Field label="E-mail"><Input name="email" type="email" required /></Field>
            <Field label="Senha" hint="8 caracteres, com maiúscula, minúscula, número e símbolo."><Input name="password" type="password" required /></Field>
            <Field label="Nível">
              <NativeSelect name="role" defaultValue="ASSISTANT">
                <option value="ADMIN">Administrador</option>
                <option value="OPERATOR">Padrão</option>
                <option value="ASSISTANT">Ajudante</option>
              </NativeSelect>
            </Field>
            <SubmitButton>Criar usuário</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
