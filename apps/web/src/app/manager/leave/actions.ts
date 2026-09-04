"use server";

import { revalidatePath } from "next/cache";
import { decideLeaveRequest, grantLeaveBalance, upsertLeaveType } from "@platform/leave";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requireLogin, requirePermissionPage } from "@/lib/session";
import { bool, num, runAction, str, type ActionState } from "@/lib/actions";

export async function decideLeaveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requireLogin();
    const decision = str(formData, "decision") === "approved" ? "approved" : "rejected";
    await decideLeaveRequest(db(), p, str(formData, "requestId"), decision, str(formData, "comment"), await requestMeta());
    revalidatePath("/manager/leave");
    return { ok: true, message: decision === "approved" ? "承認しました" : "却下しました" };
  });
}

export async function grantBalanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("leave.admin");
    const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
    if (!employeeIds.length) return { ok: false, error: "職員を選択してください" };
    const days = num(formData, "days");
    if (!Number.isFinite(days) || days < 0 || days * 2 !== Math.round(days * 2)) return { ok: false, error: "日数は 0.5 日単位で指定してください" };
    const meta = await requestMeta();
    for (const employeeId of employeeIds) {
      await grantLeaveBalance(
        db(),
        { employeeId, leaveTypeId: str(formData, "leaveTypeId"), fiscalYear: Math.round(num(formData, "fiscalYear")), grantedHalfDays: Math.round(days * 2), validFrom: str(formData, "validFrom") || null, expiresOn: str(formData, "expiresOn") || null, note: str(formData, "note") || null },
        { userId: p.userId, ...meta },
      );
    }
    revalidatePath("/manager/leave");
    return { ok: true, message: `${employeeIds.length} 名に付与しました` };
  });
}

export async function saveLeaveTypeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("leave.admin");
    await upsertLeaveType(
      db(),
      { id: str(formData, "id") || undefined, code: str(formData, "code"), name: str(formData, "name"), paid: bool(formData, "paid"), requiresBalance: bool(formData, "requiresBalance"), allowHalfDay: bool(formData, "allowHalfDay"), active: bool(formData, "active") },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/manager/leave");
    return { ok: true, message: "保存しました" };
  });
}
