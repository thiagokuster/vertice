import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";

export default function RecuperarSenhaPage() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Recuperar senha</h1>
        <p className="text-sm text-muted-foreground">
          Informe o e-mail da conta. Se ele existir, enviaremos um link válido por 30 minutos.
        </p>
        <ResetRequestForm />
        <Link className="text-sm text-primary" href="/login">Voltar ao login</Link>
      </div>
    </main>
  );
}
