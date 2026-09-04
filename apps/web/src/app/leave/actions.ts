"use server";

import { revalidatePath } from "next/cache";
import { cancelLeaveRequest, createLeaveRequest } from "@platform/leave";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requireLogin } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function createLeaveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requireLogin();
    const half = str(formData, "half");
    await createLeaveRequest(
      db(),
      p,
      {
        leaveTypeId: str(formData, "leaveTypeId"),
        startDate: str(formData, "startDate"),
        endDate: str(formData, "endDate") || str(formData, "startDate"),
        half: half === "am" || half === "pm" ? half : null,
        reason: str(formData, "reason"),
      },
      await requestMeta(),
    );
    revalidatePath("/leave");
    return { ok: true, message: "休暇を申請しました" };
  });
}

export async function cancelLeaveAction(formData: FormData): Promise<void> {
  const p = await requireLogin();
  await cancelLeaveRequest(db(), p, str(formData, "requestId"), await requestMeta());
  revalidatePath("/leave");
}
