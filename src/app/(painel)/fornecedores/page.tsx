import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { Permission, userCan } from "@/lib/permissions";
import { saveSupplier } from "@/server/actions/catalog";
import { formatCnpj } from "@/lib/format";
import { PageHeader, EmptyState, Field } from "@/components/page";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FornecedoresPage() {
  const user = await requirePermission(Permission.SUPPLIERS_VIEW);
  const [suppliers, canCreate] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { companyName: "asc" }, include: { _count: { select: { products: true, movements: true } } } }),
    userCan(user, Permission.SUPPLIERS_CREATE),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Fornecedores" description="Consulte empresas, contatos e o histórico de fornecimento." />
      {suppliers.length === 0 ? <EmptyState title="Nenhum fornecedor" text="O administrador pode autorizar o cadastro para o perfil padrão." /> : (
        <Table>
          <TableHeader><TableRow><TableHead>Empresa</TableHead><TableHead>CNPJ</TableHead><TableHead>Contato</TableHead><TableHead>Produtos</TableHead><TableHead>Entradas</TableHead></TableRow></TableHeader>
          <TableBody>
            {suppliers.map((supplier) => (
              <TableRow key={supplier.id}>
                <TableCell><Link className="font-medium hover:underline" href={`/fornecedores/${supplier.id}`}>{supplier.companyName}</Link></TableCell>
                <TableCell>{formatCnpj(supplier.cnpj)}</TableCell>
                <TableCell>{supplier.contactName || supplier.phone || "—"}</TableCell>
                <TableCell>{supplier._count.products}</TableCell>
                <TableCell>{supplier._count.movements}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {canCreate ? (
        <Card>
          <CardHeader><CardTitle>Novo fornecedor</CardTitle></CardHeader>
          <CardContent>
            <SupplierForm actionLabel="Cadastrar" />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function SupplierForm({
  supplier,
  actionLabel,
}: {
  supplier?: {
    id: string;
    companyName: string;
    cnpj: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    contactName: string | null;
    notes: string | null;
    active: boolean;
  };
  actionLabel: string;
}) {
  return (
    <ActionForm action={saveSupplier} className="grid gap-3 md:grid-cols-2">
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <Field label="Empresa"><Input name="companyName" required defaultValue={supplier?.companyName} /></Field>
      <Field label="CNPJ"><Input name="cnpj" defaultValue={supplier?.cnpj ?? ""} placeholder="00.000.000/0000-00" /></Field>
      <Field label="Telefone"><Input name="phone" defaultValue={supplier?.phone ?? ""} /></Field>
      <Field label="E-mail"><Input name="email" type="email" defaultValue={supplier?.email ?? ""} /></Field>
      <Field label="Contato responsável"><Input name="contactName" defaultValue={supplier?.contactName ?? ""} /></Field>
      <Field label="Status">
        <select name="active" defaultValue={supplier?.active === false ? "false" : "true"} className="h-8 rounded-lg border px-2 text-sm">
          <option value="true">Ativo</option>
          <option value="false">Inativo</option>
        </select>
      </Field>
      <div className="md:col-span-2"><Field label="Endereço"><Input name="address" defaultValue={supplier?.address ?? ""} /></Field></div>
      <div className="md:col-span-2"><Field label="Observações"><Textarea name="notes" defaultValue={supplier?.notes ?? ""} /></Field></div>
      <SubmitButton>{actionLabel}</SubmitButton>
    </ActionForm>
  );
}
