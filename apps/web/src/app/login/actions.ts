"use server";

import { redirect } from "next/navigation";
import { LocalPasswordProvider, createSession } from "@platform/auth";
import { writeAudit } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { setSessionCookie } from "@/lib/session";
import { str, type ActionState } from "@/lib/actions";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loginId = str(formData, "loginId");
  const password = String(formData.get("password") ?? "");
  if (!loginId || !password) return { ok: false, error: "ログインIDとパスワードを入力してください" };

  const meta = await requestMeta();
  const provider = new LocalPasswordProvider(db());
  const result = await provider.authenticate({ loginId, password, ipAddress: meta.ipAddress });
  if (!result.ok) {
    await writeAudit(db(), { ...meta, action: "auth.login_failed", details: { loginId, reason: result.reason } });
    if (result.reason === "locked") return { ok: false, error: "一定回数以上失敗したため、しばらくログインできません。時間をおいて再度お試しください。" };
    if (result.reason === "disabled") return { ok: false, error: "このアカウントは無効化されています。管理者に連絡してください。" };
    return { ok: false, error: "ログインIDまたはパスワードが正しくありません" };
  }
  const { token, sessionId } = await createSession(db(), result.userId, meta);
  await setSessionCookie(token);
  await writeAudit(db(), { ...meta, actorUserId: result.userId, action: "auth.login", targetType: "session", targetId: sessionId });
  redirect("/");
}
