import { and, eq, gt, isNull, lt } from "drizzle-orm";
import {
  users,
  userSessions,
  userRoles,
  roles,
  rolePermissions,
  permissions,
  MFA_REQUIRED_ROLES,
  type Database,
  type DbExecutor,
  type PermissionCode,
  type RoleCode,
} from "@platform/database";
import type { Principal, RequestMeta } from "@platform/core";
import { randomToken, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "cp_session";

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3_600_000;
}

export async function createSession(db: DbExecutor, userId: string, meta: RequestMeta & { mfaVerified?: boolean }) {
  const token = randomToken(32);
  const id = sha256Hex(token);
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.insert(userSessions).values({
    id,
    userId,
    expiresAt,
    mfaVerified: meta.mfaVerified ?? false,
    ipAddress: meta.ipAddress ?? null,
    userAgent: meta.userAgent?.slice(0, 512) ?? null,
  });
  return { token, sessionId: id, expiresAt };
}

export async function markSessionMfaVerified(db: DbExecutor, sessionId: string) {
  await db.update(userSessions).set({ mfaVerified: true }).where(eq(userSessions.id, sessionId));
}

export async function revokeSession(db: DbExecutor, sessionId: string) {
  await db.update(userSessions).set({ revokedAt: new Date() }).where(eq(userSessions.id, sessionId));
}

export async function revokeAllSessions(db: DbExecutor, userId: string) {
  await db.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, userId), isNull(userSessions.revokedAt)));
}

export async function purgeExpiredSessions(db: DbExecutor) {
  await db.delete(userSessions).where(lt(userSessions.expiresAt, new Date()));
}

export async function loadPermissions(db: DbExecutor, userId: string) {
  const roleRows = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const permRows = await db
    .select({ code: permissions.code })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, userId));
  return {
    roles: roleRows.map((r) => r.code as RoleCode),
    permissions: new Set(permRows.map((p) => p.code as PermissionCode)),
  };
}

/** Does this user's role set require MFA (§31)? */
export function rolesRequireMfa(userRoleCodes: readonly string[], userFlag: boolean): boolean {
  return userFlag || userRoleCodes.some((r) => (MFA_REQUIRED_ROLES as string[]).includes(r));
}

/** Resolve the principal from a cookie token; touches last_seen. */
export async function resolveSession(db: Database, token: string | undefined | null): Promise<Principal | null> {
  if (!token) return null;
  const id = sha256Hex(token);
  const now = new Date();
  const [row] = await db
    .select({ session: userSessions, user: users })
    .from(userSessions)
    .innerJoin(users, eq(users.id, userSessions.userId))
    .where(and(eq(userSessions.id, id), isNull(userSessions.revokedAt), gt(userSessions.expiresAt, now)));
  if (!row || row.user.status !== "active") return null;
  if (now.getTime() - row.session.lastSeenAt.getTime() > 60_000) {
    await db.update(userSessions).set({ lastSeenAt: now }).where(eq(userSessions.id, id));
  }
  const { roles: roleCodes, permissions: perms } = await loadPermissions(db, row.user.id);
  return {
    userId: row.user.id,
    employeeId: row.user.employeeId,
    loginId: row.user.loginId,
    roles: roleCodes,
    permissions: perms,
    mfaVerified: row.session.mfaVerified,
    sessionId: id,
  };
}
