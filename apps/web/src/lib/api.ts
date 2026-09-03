import { NextResponse } from "next/server";
import { isTrustedOrigin } from "@platform/auth";
import { PlatformError, hasPermission, type Principal } from "@platform/core";
import type { PermissionCode } from "@platform/database";
import { getPrincipal, pendingStep } from "./session";

export function jsonError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

/**
 * Guard for JSON API routes: session, pending steps, permission and (for mutations) origin check.
 */
export async function apiPrincipal(req: Request, permission: PermissionCode): Promise<Principal | NextResponse> {
  if (req.method !== "GET" && req.method !== "HEAD" && !isTrustedOrigin(req.headers)) {
    return jsonError(403, "BAD_ORIGIN", "不正なリクエスト元です");
  }
  const p = await getPrincipal();
  if (!p) return jsonError(401, "UNAUTHORIZED", "ログインが必要です");
  if (await pendingStep(p)) return jsonError(403, "PENDING_STEP", "追加認証が必要です");
  if (!hasPermission(p, permission)) return jsonError(403, "FORBIDDEN", "権限がありません");
  return p;
}

export function handleApiError(err: unknown) {
  if (err instanceof PlatformError) {
    return jsonError(err.status, err.code, err.message, err.details);
  }
  console.error(err);
  return jsonError(500, "INTERNAL", "サーバエラーが発生しました");
}
