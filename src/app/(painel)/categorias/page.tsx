import { prisma } from "@/lib/prisma";
import { requireAny } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { saveCategory, deleteCategory } from "@/server/actions/catalog";
import { PageHeader, EmptyState, Field, NativeSelect } from "@/components/page";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CategoriasPage() {
  const user = await requireAny([Permission.CATEGORIES_VIEW, Permission.CATEGORIES_MANAGE]);
  const [categories, canManage] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } }),
    userCan(user, Permission.CATEGORIES_MANAGE),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <PageHeader title="Categorias" description="Organize o catálogo. Categorias com produtos não podem ser excluídas." />
        {categories.length === 0 ? <EmptyState title="Nenhuma categoria" text="Cadastre uma categoria antes de incluir produtos." /> : (
          <div className="space-y-3">
            {categories.map((category) => (
              <Card key={category.id}>
                <CardHeader><CardTitle>{category.name}</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{category.description || "Sem descrição"} · {category._count.products} produto(s) · {category.active ? "Ativa" : "Inativa"}</p>
                  {canManage ? (
                    <ActionForm action={saveCategory} className="grid gap-2">
                      <input type="hidden" name="id" value={category.id} />
                      <Input name="name" defaultValue={category.name} required />
                      <Textarea name="description" defaultValue={category.description ?? ""} />
                      <NativeSelect name="active" defaultValue={category.active ? "true" : "false"}>
                        <option value="true">Ativa</option>
                        <option value="false">Inativa</option>
                      </NativeSelect>
                      <div className="flex gap-2">
                        <SubmitButton>Salvar</SubmitButton>
                        <ConfirmButton action={deleteCategory} fields={{ id: category.id }} label="Excluir" title="Excluir categoria" description="A exclusão só ocorre se não houver produtos vinculados." />
                      </div>
                    </ActionForm>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      {canManage ? (
        <Card className="h-fit">
          <CardHeader><CardTitle>Nova categoria</CardTitle></CardHeader>
          <CardContent>
            <ActionForm action={saveCategory} className="space-y-3">
              <Field label="Nome"><Input name="name" required /></Field>
              <Field label="Descrição"><Textarea name="description" /></Field>
              <SubmitButton>Cadastrar</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
