import { prisma } from "../src/lib/prisma";

const base = process.env.APP_URL ?? "http://localhost:3000";

const USERS = {
  admin: { email: "admin@estoque.local", password: "Admin@123456" },
  operator: { email: "operador@estoque.local", password: "Operador@123456" },
  assistant: { email: "ajudante@estoque.local", password: "Ajudante@123456" },
} as const;

const PAGES: { path: string; admin: string; operator: string; assistant: string }[] = [
  { path: "/usuarios", admin: "/usuarios", operator: "/acesso-negado", assistant: "/acesso-negado" },
  { path: "/auditoria", admin: "/auditoria", operator: "/acesso-negado", assistant: "/acesso-negado" },
  { path: "/configuracoes", admin: "/configuracoes", operator: "/acesso-negado", assistant: "/acesso-negado" },
  { path: "/ajustes", admin: "/ajustes", operator: "/acesso-negado", assistant: "/acesso-negado" },
  { path: "/transferencias", admin: "/transferencias", operator: "/acesso-negado", assistant: "/acesso-negado" },
  { path: "/entradas", admin: "/entradas", operator: "/entradas", assistant: "/acesso-negado" },
  { path: "/saidas", admin: "/saidas", operator: "/saidas", assistant: "/acesso-negado" },
  { path: "/produtos/novo", admin: "/produtos/novo", operator: "/produtos/novo", assistant: "/acesso-negado" },
  { path: "/produtos/importar", admin: "/produtos/importar", operator: "/produtos/importar", assistant: "/acesso-negado" },
  { path: "/relatorios", admin: "/relatorios", operator: "/relatorios", assistant: "/acesso-negado" },
  { path: "/fornecedores", admin: "/fornecedores", operator: "/fornecedores", assistant: "/acesso-negado" },
  { path: "/produtos", admin: "/produtos", operator: "/produtos", assistant: "/produtos" },
  { path: "/categorias", admin: "/categorias", operator: "/categorias", assistant: "/categorias" },
  { path: "/depositos", admin: "/depositos", operator: "/depositos", assistant: "/depositos" },
  { path: "/movimentacoes", admin: "/movimentacoes", operator: "/movimentacoes", assistant: "/movimentacoes" },
  { path: "/alertas", admin: "/alertas", operator: "/alertas", assistant: "/alertas" },
];

function readCookies(response: Response) {
  const list = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return list.map((item) => item.split(";")[0]).filter(Boolean);
}

function mergeCookies(current: string, next: string[]) {
  const jar = new Map<string, string>();
  for (const part of [...current.split(";"), ...next].map((item) => item.trim()).filter(Boolean)) {
    jar.set(part.slice(0, part.indexOf("=")), part);
  }
  return [...jar.values()].join("; ");
}

async function login(email: string, password: string) {
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  let jar = mergeCookies("", readCookies(csrfRes));
  const payload = (await csrfRes.json()) as { csrfToken?: string };
  const body = new URLSearchParams({
    csrfToken: payload.csrfToken ?? "",
    email,
    password,
    callbackUrl: `${base}/`,
  });
  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar },
    body,
    redirect: "manual",
  });
  jar = mergeCookies(jar, readCookies(res));
  return { jar, hasSession: jar.includes("session-token="), location: res.headers.get("location") ?? "" };
}

function applyCookies(current: string, response: Response) {
  const jar = new Map<string, string>();
  for (const part of current.split(";").map((item) => item.trim()).filter(Boolean)) {
    jar.set(part.slice(0, part.indexOf("=")), part);
  }
  for (const part of readCookies(response)) {
    const name = part.slice(0, part.indexOf("="));
    const value = part.slice(part.indexOf("=") + 1);
    if (!value) jar.delete(name);
    else jar.set(name, part);
  }
  return [...jar.values()].join("; ");
}

async function follow(cookie: string, path: string) {
  let current = path;
  let jar = cookie;
  for (let hop = 0; hop < 6; hop += 1) {
    const res = await fetch(new URL(current, base), { headers: { cookie: jar }, redirect: "manual" });
    jar = applyCookies(jar, res);
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") || "/";
      current = new URL(location, base).pathname;
      continue;
    }
    const html = await res.text();
    const refresh = html.match(/http-equiv="refresh" content="[^"]*url=([^"]+)"/i);
    if (refresh?.[1]) {
      const next = new URL(refresh[1], base).pathname;
      if (next !== current) {
        current = next;
        continue;
      }
    }
    return { status: res.status, path: current };
  }
  return { status: 0, path: current };
}

async function main() {
  let failed = 0;
  const fail = (message: string) => {
    failed += 1;
    console.log("ERRO", message);
  };
  const ok = (message: string) => console.log("ok", message);

  try {
    await fetch(base, { redirect: "manual" });
  } catch {
    console.log("ERRO servidor local indisponível em", base);
    process.exit(1);
  }

  const anonPage = await follow("", "/usuarios");
  if (anonPage.path.startsWith("/login")) ok("anônimo em /usuarios vai para o login");
  else fail(`anônimo em /usuarios ficou em ${anonPage.path}`);

  const anonSearch = await fetch(`${base}/api/busca?q=papel`);
  if (anonSearch.status === 401) ok("anônimo recebe 401 em /api/busca");
  else fail(`anônimo em /api/busca recebeu ${anonSearch.status}`);

  const anonExport = await fetch(`${base}/api/relatorios/export?tipo=posicao&formato=xlsx`);
  if (anonExport.status === 401) ok("anônimo recebe 401 na exportação");
  else fail(`anônimo na exportação recebeu ${anonExport.status}`);

  const sessions: Record<keyof typeof USERS, string> = { admin: "", operator: "", assistant: "" };
  for (const role of Object.keys(USERS) as (keyof typeof USERS)[]) {
    const account = USERS[role];
    const result = await login(account.email, account.password);
    if (!result.hasSession) {
      fail(`login de ${role} não criou sessão (${result.location})`);
      continue;
    }
    sessions[role] = result.jar;
    ok(`login de ${role}`);
  }

  for (const page of PAGES) {
    for (const role of ["admin", "operator", "assistant"] as const) {
      if (!sessions[role]) continue;
      const result = await follow(sessions[role], page.path);
      const expected = page[role];
      if (result.status === 200 && result.path === expected) ok(`${role} em ${page.path}`);
      else fail(`${role} em ${page.path}: esperado ${expected}, veio ${result.status} ${result.path}`);
    }
  }

  for (const role of ["admin", "operator", "assistant"] as const) {
    if (!sessions[role]) continue;
    const search = await fetch(`${base}/api/busca?q=papel`, { headers: { cookie: sessions[role] } });
    if (search.status === 200) ok(`${role} consulta /api/busca`);
    else fail(`${role} em /api/busca recebeu ${search.status}`);
    const report = await fetch(`${base}/api/relatorios/export?tipo=posicao&formato=xlsx`, {
      headers: { cookie: sessions[role] },
    });
    const expected = role === "admin" ? 200 : 403;
    if (report.status === expected) ok(`${role} na exportação recebe ${expected}`);
    else fail(`${role} na exportação: esperado ${expected}, veio ${report.status}`);
  }

  const operator = await prisma.user.findUniqueOrThrow({ where: { email: USERS.operator.email } });
  const original = {
    tokenVersion: operator.tokenVersion,
    lockedUntil: operator.lockedUntil,
    active: operator.active,
    failedLoginAttempts: operator.failedLoginAttempts,
  };
  try {
    if (sessions.operator) {
      await prisma.user.update({
        where: { id: operator.id },
        data: { tokenVersion: { increment: 1 } },
      });
      const revoked = await fetch(`${base}/api/busca?q=papel`, { headers: { cookie: sessions.operator } });
      if (revoked.status === 401) ok("sessão do padrão cai depois do bloqueio");
      else fail(`sessão revogada ainda consultou a API (${revoked.status})`);
      const revokedPage = await follow(sessions.operator, "/produtos");
      if (revokedPage.path.startsWith("/login")) ok("página do padrão volta ao login depois do bloqueio");
      else fail(`página revogada ficou em ${revokedPage.path}`);

      await prisma.user.update({
        where: { id: operator.id },
        data: { tokenVersion: original.tokenVersion, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) },
      });
      const lockedApi = await fetch(`${base}/api/busca?q=papel`, { headers: { cookie: sessions.operator } });
      if (lockedApi.status === 401) ok("API recusa a sessão enquanto a conta está bloqueada");
      else fail(`conta bloqueada ainda consultou a API (${lockedApi.status})`);
      const fresh = await login(USERS.operator.email, USERS.operator.password);
      if (fresh.hasSession) fail("conta bloqueada conseguiu entrar");
      else ok("login recusado enquanto a conta está bloqueada");
    }
  } finally {
    await prisma.user.update({ where: { id: operator.id }, data: original });
  }

  const probe = "forca-bruta@teste.local";
  try {
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await login(probe, "senha-errada");
    }
    const limited = await login(probe, "senha-errada");
    if (!limited.hasSession) ok("força bruta não cria sessão");
    else fail("força bruta criou sessão");
    const stored = await prisma.loginAttempt.count({ where: { email: probe, success: false } });
    if (stored >= 11) ok("tentativas de login ficaram gravadas");
    else fail(`só ${stored} tentativas foram gravadas`);
  } finally {
    await prisma.loginAttempt.deleteMany({ where: { email: probe } });
  }

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main();
