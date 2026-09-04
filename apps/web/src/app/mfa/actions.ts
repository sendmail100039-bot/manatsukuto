"use server";

import { redirect } from "next/navigation";
import { beginMfaEnrollment, confirmMfaEnrollment, markSessionMfaVerified, verifyMfaCode } from "@platform/auth";
import { writeAudit } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { getPrincipal } from "@/lib/session";
import { str, type ActionState } from "@/lib/actions";

export type MfaEnrollState = { ok?: boolean; error?: string; message?: string; recoveryCodes?: string[] } | undefined;

export async function startEnrollmentAction(): Promise<{ secret: string; uri: string } | { error: string }> {
  const p = await getPrincipal();
  if (!p) return { error: "ログインが必要です" };
  return beginMfaEnrollment(db(), p.userId, p.loginId);
}

export async function confirmEnrollmentAction(_prev: MfaEnrollState, formData: FormData): Promise<MfaEnrollState> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  const res = await confirmMfaEnrollment(db(), p.userId, str(formData, "code"), await requestMeta());
  if (!res.ok) return { ok: false, error: res.error };
  await markSessionMfaVerified(db(), p.sessionId);
  return { ok: true, recoveryCodes: res.recoveryCodes, message: "MFAを有効化しました。リカバリーコードを安全な場所に保管してください。" };
}

export async function verifyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const p = await getPrincipal();
  if (!p) redirect("/login");
  const meta = await requestMeta();
  const ok = await verifyMfaCode(db(), p.userId, str(formData, "code"));
  if (!ok) {
    await writeAudit(db(), { ...meta, actorUserId: p.userId, action: "auth.login_failed", details: { step: "mfa" } });
    return { ok: false, error: "認証コードが正しくありません" };
  }
  await markSessionMfaVerified(db(), p.sessionId);
  await writeAudit(db(), { ...meta, actorUserId: p.userId, action: "auth.mfa_verified", targetType: "session", targetId: p.sessionId });
  redirect("/");
}
