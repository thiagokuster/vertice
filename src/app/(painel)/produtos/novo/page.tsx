import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { saveProduct } from "@/server/actions/catalog";
import { PageHeader } from "@/components/page";
import { ProductFields } from "@/components/product-fields";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function NovoProdutoPage() {
  await requirePermission(Permission.PRODUCTS_CREATE);
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { active: true }, orderBy: { companyName: "asc" } }),
  ]);
  if (categories.length === 0) redirect("/categorias");
  return (
    <div>
      <PageHeader title="Novo produto" description="O saldo começa em zero. A quantidade muda somente por movimentação." />
      <ActionForm action={saveProduct} redirectTo="/produtos/:id" className="space-y-4">
        <ProductFields categories={categories} suppliers={suppliers} />
        <SubmitButton>Cadastrar produto</SubmitButton>
      </ActionForm>
    </div>
  );
}
