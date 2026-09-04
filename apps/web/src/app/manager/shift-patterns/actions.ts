"use server";

import { revalidatePath } from "next/cache";
import { upsertShiftPattern } from "@platform/shift";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { bool, num, runAction, str, type ActionState } from "@/lib/actions";

export async function savePatternAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("shift.manage");
    await upsertShiftPattern(
      db(),
      {
        id: str(formData, "id") || undefined,
        code: str(formData, "code"),
        name: str(formData, "name"),
        startTime: str(formData, "startTime"),
        endTime: str(formData, "endTime"),
        breakMinutes: Math.round(num(formData, "breakMinutes")),
        color: str(formData, "color") || null,
        active: bool(formData, "active"),
      },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/manager/shift-patterns");
    return { ok: true, message: "保存しました" };
  });
}
