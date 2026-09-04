"use server";

import { revalidatePath } from "next/cache";
import { cancelCorrectionRequest, createCorrectionRequest } from "@platform/attendance";
import { parseLocalDateTime } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requireLogin } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function createRequestAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requireLogin();
    const type = str(formData, "type") as "correct_time" | "add_missing" | "cancel_record";
    const inRaw = str(formData, "clockIn");
    const outRaw = str(formData, "clockOut");
    await createCorrectionRequest(
      db(),
      p,
      {
        type,
        recordId: str(formData, "recordId") || null,
        workDate: str(formData, "workDate"),
        requestedClockInAt: inRaw ? parseLocalDateTime(inRaw) : null,
        requestedClockOutAt: outRaw ? parseLocalDateTime(outRaw) : null,
        reason: str(formData, "reason"),
      },
      await requestMeta(),
    );
    revalidatePath("/requests");
    return { ok: true, message: "申請を送信しました" };
  });
}

export async function cancelRequestAction(formData: FormData): Promise<void> {
  const p = await requireLogin();
  await cancelCorrectionRequest(db(), p, str(formData, "requestId"), await requestMeta());
  revalidatePath("/requests");
}
