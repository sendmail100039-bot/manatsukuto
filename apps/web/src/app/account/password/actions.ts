"use server";

import { and, eq, ne } from "drizzle-orm";
import { hashPassword, validatePasswordPolicy, verifyPassword } from "@platform/auth";
import { writeAudit } from "@platform/core";
import { userCredentials, userSessions } from "@platform/database";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { getPrincipal } from "@/lib/session";
import type { ActionState } from "@/lib/actions";

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const p = await getPrincipal();
  if (!p) return { ok: false, error: "ログインが必要です" };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { ok: false, error: "新しいパスワードが一致しません" };
  const policy = validatePasswordPolicy(next);
  if (policy) return { ok: false, error: policy };
  const [cred] = await db().select().from(userCredentials).where(eq(userCredentials.userId, p.userId));
  if (!cred || !(await verifyPassword(current, cred.passwordHash))) return { ok: false, error: "現在のパスワードが正しくありません" };
  await db()
    .update(userCredentials)
    .set({ passwordHash: await hashPassword(next), passwordUpdatedAt: new Date(), mustChangePassword: false })
    .where(eq(userCredentials.userId, p.userId));
  await writeAudit(db(), { ...(await requestMeta()), actorUserId: p.userId, action: "auth.password_changed", targetType: "user", targetId: p.userId });
  // Keep the current session, revoke every other one.
  await db()
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(userSessions.userId, p.userId), ne(userSessions.id, p.sessionId)));
  return { ok: true, message: "パスワードを変更しました" };
}
