"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, Moon, Search, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { logoutAction } from "@/server/actions/auth";

type Item = { href: string; label: string; group: string };

export function AppShell({
  company,
  userName,
  roleLabel,
  items,
  unread,
  demo,
  children,
}: {
  company: string;
  userName: string;
  roleLabel: string;
  items: Item[];
  unread: number;
  demo: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const groups = [...new Set(items.map((item) => item.group))];
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className={`${open ? "fixed inset-0 z-40 flex" : "hidden"} bg-sidebar text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col`}>
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
            <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary font-semibold text-sidebar-primary-foreground">V</span>
            <span>
              <span className="block text-sm font-semibold tracking-wide">Vértice</span>
              <span className="block text-xs text-sidebar-foreground/70">{company}</span>
            </span>
          </Link>
          <button className="lg:hidden" onClick={() => setOpen(false)} type="button" aria-label="Fechar menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group}>
              <p className="px-2 pb-1 text-[11px] font-medium tracking-wider text-sidebar-foreground/50 uppercase">{group}</p>
              <div className="space-y-0.5">
                {items
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    >
                      {item.label}
                      {item.href === "/alertas" && unread > 0 ? (
                        <span className="ml-2 rounded-full bg-sidebar-primary px-1.5 text-[11px] text-sidebar-primary-foreground">{unread}</span>
                      ) : null}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3 text-sm">
          <p className="font-medium">{userName}</p>
          <p className="text-xs text-sidebar-foreground/70">{roleLabel}</p>
          <div className="mt-2 flex gap-2">
            <Link href="/perfil" className="rounded-lg px-2 py-1 text-xs hover:bg-sidebar-accent" onClick={() => setOpen(false)}>
              Meu acesso
            </Link>
            <form action={logoutAction}>
              <button className="rounded-lg px-2 py-1 text-xs hover:bg-sidebar-accent" type="submit">
                Sair
              </button>
            </form>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur">
          <Button type="button" variant="outline" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu />
          </Button>
          <GlobalSearch />
          <ThemeToggle />
          <Link href="/alertas" className="relative rounded-lg border px-3 py-1.5 text-sm">
            Alertas
            {unread > 0 ? <span className="absolute -top-2 -right-2 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{unread}</span> : null}
          </Link>
        </header>
        {demo ? (
          <p className="bg-sidebar-accent px-4 py-2 text-center text-xs text-sidebar-foreground">
            Ambiente de desenvolvimento. Os cadastros de exemplo não representam uma operação real.
          </p>
        ) : null}
        <main className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<{ id: string; name: string; sku: string }[]>([]);
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/busca?q=${encodeURIComponent(query)}`);
      if (response.ok) setItems(await response.json());
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
      <Input
        value={q}
        onChange={(event) => {
          const value = event.target.value;
          setQ(value);
          if (value.trim().length < 2) setItems([]);
        }}
        placeholder="Buscar produto, SKU ou código de barras"
        className="pl-8"
      />
      {q.trim().length >= 2 && items.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {items.map((item) => (
            <Link key={item.id} href={`/produtos/${item.id}`} className="block px-3 py-2 text-sm hover:bg-muted" onClick={() => setQ("")}>
              <span className="font-medium">{item.name}</span>
              <span className="ml-2 text-muted-foreground">{item.sku}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted) return <div className="size-8" />;
  const dark = theme === "dark";
  return (
    <Button type="button" variant="outline" size="icon" aria-label="Alternar tema" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}

export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), 60000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
