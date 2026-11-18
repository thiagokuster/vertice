import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { saveWarehouse, deleteWarehouse } from "@/server/actions/catalog";
import { PageHeader, Field, NativeSelect } from "@/components/page";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DepositosPage() {
  const user = await requirePermission(Permission.WAREHOUSES_VIEW);
  const [warehouses, canManage] = await Promise.all([
    prisma.warehouse.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { balances: true } } } }),
    userCan(user, Permission.WAREHOUSES_MANAGE),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Depósitos" description="Locais físicos usados nas entradas, saídas e transferências." />
      <div className="grid gap-3 md:grid-cols-2">
        {warehouses.map((warehouse) => (
          <Card key={warehouse.id}>
            <CardHeader><CardTitle>{warehouse.name}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{warehouse.code} · {warehouse.active ? "Ativo" : "Inativo"} · {warehouse._count.balances} saldo(s)</p>
              <p>{warehouse.description || "Sem descrição"}</p>
              {canManage ? (
                <ActionForm action={saveWarehouse} className="grid gap-2">
                  <input type="hidden" name="id" value={warehouse.id} />
                  <Input name="name" defaultValue={warehouse.name} required />
                  <Input name="code" defaultValue={warehouse.code} required />
                  <Textarea name="description" defaultValue={warehouse.description ?? ""} />
                  <NativeSelect name="active" defaultValue={warehouse.active ? "true" : "false"}>
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </NativeSelect>
                  <div className="flex gap-2">
                    <SubmitButton>Salvar</SubmitButton>
                    <ConfirmButton action={deleteWarehouse} fields={{ id: warehouse.id }} label="Excluir" title="Excluir depósito" description="Depósitos com saldo ou histórico só podem ser inativados." />
                  </div>
                </ActionForm>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
      {canManage ? (
        <Card>
          <CardHeader><CardTitle>Novo depósito</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveWarehouse} className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input name="name" required /></Field>
              <Field label="Código"><Input name="code" required placeholder="FILIAL" /></Field>
              <div className="md:col-span-2"><Field label="Descrição"><Textarea name="description" /></Field></div>
              <SubmitButton>Cadastrar</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
