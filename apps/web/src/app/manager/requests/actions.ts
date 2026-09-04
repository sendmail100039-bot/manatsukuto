"use server";

import { revalidatePath } from "next/cache";
import { decideCorrectionRequest } from "@platform/attendance";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requireLogin } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function decideAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requireLogin();
    const decision = str(formData, "decision") === "approved" ? "approved" : "rejected";
    await decideCorrectionRequest(db(), p, str(formData, "requestId"), decision, str(formData, "comment"), await requestMeta());
    revalidatePath("/manager/requests");
    return { ok: true, message: decision === "approved" ? "承認しました" : "却下しました" };
  });
}
