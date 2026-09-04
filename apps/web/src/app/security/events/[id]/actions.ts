"use server";

import { revalidatePath } from "next/cache";
import { reviewSecurityEvent } from "@platform/security";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function reviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("security.review");
    const decision = (["reviewed", "dismissed", "confirmed"] as const).find((d) => d === str(formData, "decision")) ?? "reviewed";
    const id = str(formData, "id");
    await reviewSecurityEvent(db(), id, decision, str(formData, "note"), { userId: p.userId, ...(await requestMeta()) });
    revalidatePath(`/security/events/${id}`);
    revalidatePath("/security");
    return { ok: true, message: "判定を記録しました" };
  });
}
