"use server";

import { revalidatePath } from "next/cache";
import { assignShift, bulkAssignShifts, cancelShift, publishShifts } from "@platform/shift";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requireLogin } from "@/lib/session";
import { managerScope } from "@/lib/scope";
import { bool, runAction, str, type ActionState } from "@/lib/actions";

export async function assignShiftAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requireLogin();
    const meta = await requestMeta();
    const employeeIds = formData.getAll("employeeIds").map(String).filter(Boolean);
    const patternId = str(formData, "patternId") || null;
    const from = str(formData, "from");
    const to = str(formData, "to") || from;
    const weekdays = formData.getAll("weekdays").map(Number).filter((n) => Number.isInteger(n));
    if (employeeIds.length === 0) return { ok: false, error: "職員を選択してください" };
    if (patternId && (to !== from || weekdays.length)) {
      const r = await bulkAssignShifts(db(), p, { employeeIds, from, to, weekdays: weekdays.length ? weekdays : undefined, patternId, locationId: str(formData, "locationId") || null, publish: bool(formData, "publish") }, meta);
      revalidatePath("/manager/shifts");
      return { ok: true, message: `${r.count} 件のシフトを登録しました` };
    }
    for (const employeeId of employeeIds) {
      await assignShift(
        db(),
        p,
        { employeeId, workDate: from, patternId, startTime: str(formData, "startTime") || null, endTime: str(formData, "endTime") || null, locationId: str(formData, "locationId") || null, note: str(formData, "note") || null, publish: bool(formData, "publish") },
        meta,
      );
    }
    revalidatePath("/manager/shifts");
    return { ok: true, message: `${employeeIds.length} 件のシフトを登録しました` };
  });
}

export async function cancelShiftAction(formData: FormData): Promise<void> {
  const p = await requireLogin();
  await cancelShift(db(), p, str(formData, "shiftId"), await requestMeta());
  revalidatePath("/manager/shifts");
}

export async function publishAction(formData: FormData): Promise<void> {
  const p = await requireLogin();
  await publishShifts(db(), p, { from: str(formData, "from"), to: str(formData, "to"), ...(await managerScope(p)) }, await requestMeta());
  revalidatePath("/manager/shifts");
}
