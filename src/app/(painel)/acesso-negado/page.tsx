import Link from "next/link";

export default function AcessoNegadoPage() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-2xl font-semibold">Acesso negado</h1>
      <p className="mt-2 text-sm text-muted-foreground">Seu perfil não pode abrir esta área. A tentativa ficou registrada na auditoria.</p>
      <Link className="mt-4 inline-block text-sm text-primary" href="/">Voltar ao painel</Link>
    </div>
  );
}
