type HeaderSource = { get(name: string): string | null };

export function trustedProxies() {
  return (process.env.TRUSTED_PROXIES ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function clientIpFrom(headers: HeaderSource, trusted = trustedProxies()) {
  const userAgent = headers.get("user-agent");
  if (trusted.length === 0) return { ip: null as string | null, userAgent };
  const forwarded = headers.get("x-forwarded-for");
  const real = headers.get("x-real-ip")?.trim() || null;
  if (!forwarded) return { ip: real, userAgent };
  const parts = forwarded.split(",").map((item) => item.trim()).filter(Boolean);
  let ip: string | null = null;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (trusted.includes(parts[index])) continue;
    ip = parts[index];
    break;
  }
  return { ip: ip ?? real, userAgent };
}
