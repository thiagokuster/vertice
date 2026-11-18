import Link from "next/link";
import { NewPasswordForm } from "@/components/auth-forms";

export default async function RedefinirSenhaPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Nova senha</h1>
        {token ? <NewPasswordForm token={token} /> : <p className="text-sm">Link incompleto. Solicite uma nova recuperação.</p>}
        <Link className="text-sm text-primary" href="/login">Voltar ao login</Link>
      </div>
    </main>
  );
}
