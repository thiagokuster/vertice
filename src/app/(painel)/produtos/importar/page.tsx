import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { Permission } from "@/lib/permissions";
import { importProducts } from "@/server/actions/import";
import { PageHeader, Field } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";

export default async function ImportarProdutosPage() {
  await requirePermission(Permission.PRODUCTS_CREATE);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Importar produtos"
        description="O arquivo cria produtos novos e atualiza os que já têm o mesmo SKU. Categoria que ainda não existe é criada. Fornecedor precisa estar cadastrado."
      />
      <p className="text-sm">
        <Link className="text-primary underline-offset-4 hover:underline" href="/modelos/produtos.csv">
          Baixar modelo CSV
        </Link>
      </p>
      <ActionForm action={importProducts} className="max-w-xl space-y-4">
        <Field label="Arquivo" hint="Até 500 linhas e 1 MB. Separador vírgula ou ponto e vírgula.">
          <Input name="file" type="file" accept=".csv,text/csv" required />
        </Field>
        <SubmitButton>Importar</SubmitButton>
      </ActionForm>
    </div>
  );
}
