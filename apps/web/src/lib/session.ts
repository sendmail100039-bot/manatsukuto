import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, resolveSession, rolesRequireMfa, sessionTtlMs } from "@platform/auth";
import { hasAnyPermission, hasPermission, type Principal } from "@platform/core";
import { users, userCredentials, type PermissionCode } from "@platform/database";
import { db } from "./db";

export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const jar = await cookies();
  return resolveSession(db(), jar.get(SESSION_COOKIE)?.value);
});

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(sessionTtlMs() / 1000),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

/** Where an authenticated principal must go before using the app (MFA / password change). */
export async function pendingStep(p: Principal): Promise<"/mfa" | "/account/password" | null> {
  const [u] = await db().select({ mfaRequired: users.mfaRequired }).from(users).where(eq(users.id, p.userId));
  if (rolesRequireMfa(p.roles, u?.mfaRequired ?? false) && !p.mfaVerified) return "/mfa";
  const [c] = await db().select({ must: userCredentials.mustChangePassword }).from(userCredentials).where(eq(userCredentials.userId, p.userId));
  if (c?.must) return "/account/password";
  return null;
}

/** For pages: redirect to login (or the pending step) when needed. */
export async function requireLogin(opts: { allowPending?: boolean } = {}): Promise<Principal> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  if (!opts.allowPending) {
    const step = await pendingStep(p);
    if (step) redirect(step);
  }
  return p;
}

export async function requirePermissionPage(code: PermissionCode | PermissionCode[]): Promise<Principal> {
  const p = await requireLogin();
  const ok = Array.isArray(code) ? hasAnyPermission(p, code) : hasPermission(p, code);
  if (!ok) redirect("/?denied=1");
  return p;
}
