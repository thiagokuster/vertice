"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginAction, requestPasswordReset, resetPassword } from "@/server/actions/auth";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-3"
      action={async (formData) => {
        setPending(true);
        const result = await loginAction(formData);
        setPending(false);
        if (result && !result.ok) toast.error(result.message);
      }}
    >
      <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
      <label className="grid gap-1.5 text-sm">
        E-mail
        <Input name="email" type="email" autoComplete="username" required placeholder="voce@empresa.com" />
      </label>
      <label className="grid gap-1.5 text-sm">
        Senha
        <Input name="password" type="password" autoComplete="current-password" required />
      </label>
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [link, setLink] = useState<string | null>(null);
  return (
    <form
      className="space-y-3"
      action={async (formData) => {
        const result = await requestPasswordReset(formData);
        if (result.ok) {
          toast.success(result.message);
          setLink(result.devLink ?? null);
        } else toast.error(result.message);
      }}
    >
      <label className="grid gap-1.5 text-sm">
        E-mail
        <Input name="email" type="email" required />
      </label>
      <Button type="submit">Enviar instruções</Button>
      {link ? (
        <p className="rounded-lg bg-muted p-3 text-xs break-all">
          Link de desenvolvimento: <a className="underline" href={link}>{link}</a>
        </p>
      ) : null}
    </form>
  );
}

export function NewPasswordForm({ token }: { token: string }) {
  return (
    <form
      className="space-y-3"
      action={async (formData) => {
        const result = await resetPassword(formData);
        if (result && !result.ok) toast.error(result.message);
      }}
    >
      <input type="hidden" name="token" value={token} />
      <label className="grid gap-1.5 text-sm">
        Nova senha
        <Input name="password" type="password" required />
      </label>
      <label className="grid gap-1.5 text-sm">
        Confirmar senha
        <Input name="confirm" type="password" required />
      </label>
      <Button type="submit">Salvar senha</Button>
    </form>
  );
}
