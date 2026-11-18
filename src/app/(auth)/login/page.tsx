import Link from "next/link";
import { LoginForm } from "@/components/auth-forms";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; senha?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">V</span>
          <span className="text-lg font-semibold">Vértice</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-semibold tracking-tight">Estoque com rastro de cada unidade.</h1>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/75">
            Entradas, saídas, transferências e ajustes ficam no histórico. O acesso muda conforme o papel de cada pessoa.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Gestão de estoque</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <p className="text-lg font-semibold">Vértice</p>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Entrar</h2>
            <p className="mt-1 text-sm text-muted-foreground">Use o e-mail e a senha fornecidos pelo administrador.</p>
          </div>
          {params.senha ? (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm">Senha atualizada. Entre novamente.</p>
          ) : null}
          <LoginForm callbackUrl={params.callbackUrl} />
          <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/recuperar-senha">
            Esqueci minha senha
          </Link>
          {process.env.NODE_ENV === "development" ? (
            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Acesso de demonstração</p>
              <p className="mt-1">admin@estoque.local · Admin@123456</p>
              <p>operador@estoque.local · Operador@123456</p>
              <p>ajudante@estoque.local · Ajudante@123456</p>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
