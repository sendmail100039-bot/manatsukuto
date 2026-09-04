import type { PermissionCode, RoleCode } from "@platform/database";
import { ForbiddenError } from "./errors";

/** Request metadata captured for audit logs and security checks. */
export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** The authenticated principal for the current request. */
export interface Principal {
  userId: string;
  employeeId: string | null;
  loginId: string;
  roles: RoleCode[];
  permissions: Set<PermissionCode>;
  mfaVerified: boolean;
  sessionId: string;
}

export function hasPermission(p: Principal | null | undefined, code: PermissionCode): boolean {
  return !!p && p.permissions.has(code);
}

export function hasAnyPermission(p: Principal | null | undefined, codes: PermissionCode[]): boolean {
  return codes.some((c) => hasPermission(p, c));
}

export function requirePermission(p: Principal | null | undefined, code: PermissionCode): asserts p is Principal {
  if (!hasPermission(p, code)) throw new ForbiddenError();
}

export function requireAnyPermission(p: Principal | null | undefined, codes: PermissionCode[]): asserts p is Principal {
  if (!hasAnyPermission(p, codes)) throw new ForbiddenError();
}
