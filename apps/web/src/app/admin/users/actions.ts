"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { hashPassword, validatePasswordPolicy, revokeAllSessions } from "@platform/auth";
import { ValidationError, setUserRoles, writeAudit } from "@platform/core";
import { ROLES, userCredentials, users } from "@platform/database";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { bool, runAction, str, type ActionState } from "@/lib/actions";

const roleCodes = (fd: FormData) => Object.keys(ROLES).filter((code) => fd.get(`role_${code}`) === "on");

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.user.admin");
    const loginId = str(formData, "loginId");
    const password = String(formData.get("password") ?? "");
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(loginId)) throw new ValidationError("ログインIDは英数字・._- 3〜64文字で指定してください");
    const policy = validatePasswordPolicy(password);
    if (policy) throw new ValidationError(policy);
    const employeeId = str(formData, "employeeId") || null;
    const meta = await requestMeta();
    await db().transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ loginId, employeeId, email: str(formData, "email") || null, mfaRequired: bool(formData, "mfaRequired") })
        .returning();
      await tx.insert(userCredentials).values({ userId: u!.id, passwordHash: await hashPassword(password), mustChangePassword: true });
      await setUserRoles(tx, u!.id, roleCodes(formData), { userId: p.userId, ...meta });
      await writeAudit(tx, { ...meta, actorUserId: p.userId, action: "user.created", targetType: "user", targetId: u!.id, details: { loginId, employeeId } });
    });
    revalidatePath("/admin/users");
    return { ok: true, message: "ユーザーを作成しました(初回ログイン時にパスワード変更を求めます)" };
  });
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.user.admin");
    const id = str(formData, "id");
    const status = (["active", "locked", "disabled"] as const).find((s) => s === str(formData, "status")) ?? "active";
    const meta = await requestMeta();
    await db().transaction(async (tx) => {
      await tx
        .update(users)
        .set({ status, employeeId: str(formData, "employeeId") || null, email: str(formData, "email") || null, mfaRequired: bool(formData, "mfaRequired"), updatedAt: new Date() })
        .where(eq(users.id, id));
      await setUserRoles(tx, id, roleCodes(formData), { userId: p.userId, ...meta });
      const newPassword = String(formData.get("password") ?? "");
      if (newPassword) {
        const policy = validatePasswordPolicy(newPassword);
        if (policy) throw new ValidationError(policy);
        await tx.update(userCredentials).set({ passwordHash: await hashPassword(newPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null }).where(eq(userCredentials.userId, id));
        await revokeAllSessions(tx, id);
      }
      if (status !== "active") await revokeAllSessions(tx, id);
      await writeAudit(tx, { ...meta, actorUserId: p.userId, action: "user.updated", targetType: "user", targetId: id, details: { status, passwordReset: !!newPassword } });
    });
    revalidatePath("/admin/users");
    return { ok: true, message: "更新しました" };
  });
}
