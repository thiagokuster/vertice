export const EXAMPLE_AUTH_SECRET = "troque-por-um-segredo-longo";
export const DEMO_ADMIN_PASSWORD = "Admin@123456";

type RuntimeEnv = {
  NODE_ENV?: string;
  NEXT_PHASE?: string;
  AUTH_SECRET?: string;
  SEED_DEMO?: string;
};

export function assertProductionAuthSecret(env: RuntimeEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;
  const secret = env.AUTH_SECRET ?? "";
  if (secret.length < 32 || secret === EXAMPLE_AUTH_SECRET) {
    throw new Error(
      "Em produção, AUTH_SECRET precisa ter pelo menos 32 caracteres e não pode ser o valor de exemplo.",
    );
  }
}

export function resolveAdminPassword(password: string | undefined, env: RuntimeEnv = process.env) {
  const production = env.NODE_ENV === "production";
  const demo = env.SEED_DEMO === "true" && !production;
  if (production) {
    if (!password || password === DEMO_ADMIN_PASSWORD) {
      throw new Error("Em produção, defina ADMIN_PASSWORD com uma senha própria. A senha de exemplo não pode ser usada.");
    }
    return password;
  }
  if (password && password !== DEMO_ADMIN_PASSWORD) return password;
  if (demo) return DEMO_ADMIN_PASSWORD;
  throw new Error("Defina ADMIN_PASSWORD. A senha de exemplo só é criada com SEED_DEMO=true, fora de produção.");
}
