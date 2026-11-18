"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/server/result";

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}

const PendingContext = createContext(false);

export function SubmitButton({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "destructive" | "outline" }) {
  const pending = useContext(PendingContext);
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? "Salvando..." : children}
    </Button>
  );
}

export function ActionForm({
  action,
  children,
  className,
  redirectTo,
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  return (
    <PendingContext.Provider value={pending}>
      <form
        className={className}
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const formData = new FormData(form);
          if (!formData.get("idempotencyKey")) formData.set("idempotencyKey", key);
          setPending(true);
          try {
            const result = await action(formData);
            if (result.ok) {
              toast.success(result.message);
              if (result.devLink) toast.message(result.devLink, { duration: 20000 });
              setKey(crypto.randomUUID());
              form.reset();
              if (redirectTo) router.push(redirectTo.replace(":id", result.id ?? ""));
              else router.refresh();
            } else {
              toast.error(result.message);
            }
          } catch (error) {
            if (isRedirectError(error)) throw error;
            toast.error("Não foi possível concluir a operação.");
          } finally {
            setPending(false);
          }
        }}
      >
        <input type="hidden" name="idempotencyKey" value={key} />
        {children}
      </form>
    </PendingContext.Provider>
  );
}

export function ConfirmButton({
  action,
  title,
  description,
  label,
  fields,
  variant = "destructive",
}: {
  action: (formData: FormData) => Promise<ActionResult>;
  title: string;
  description: string;
  label: string;
  fields?: Record<string, string>;
  variant?: "destructive" | "outline";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-popover p-4 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <ActionForm action={action}>
                {Object.entries(fields ?? {}).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <SubmitButton variant={variant}>{label}</SubmitButton>
              </ActionForm>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
