/**
 * CSRF / origin protection for state-changing requests (§46).
 * Session cookies are SameSite=Lax + HttpOnly; in addition every mutating
 * request must carry an Origin (or Referer) that matches APP_ORIGIN.
 */
export function isTrustedOrigin(headers: { get(name: string): string | null }, appOrigin = process.env.APP_ORIGIN): boolean {
  const origin = headers.get("origin") ?? (headers.get("referer") ? safeOrigin(headers.get("referer")!) : null);
  if (!origin) return false;
  const allowed = new Set<string>();
  if (appOrigin) allowed.add(normalize(appOrigin));
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = headers.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "production" ? "https" : "http");
  if (host) allowed.add(normalize(`${proto}://${host}`));
  return allowed.has(normalize(origin));
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalize(origin: string): string {
  try {
    return new URL(origin).origin.toLowerCase();
  } catch {
    return origin.toLowerCase();
  }
}

/** Extract the client IP honouring the reverse proxy when TRUST_PROXY=true. */
export function clientIp(headers: { get(name: string): string | null }): string | null {
  if (process.env.TRUST_PROXY === "true") {
    const cf = headers.get("cf-connecting-ip");
    if (cf) return cf;
    const xff = headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    const real = headers.get("x-real-ip");
    if (real) return real;
  }
  return null;
}
