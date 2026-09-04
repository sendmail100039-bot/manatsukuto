"use server";

import { revalidatePath } from "next/cache";
import { updateDevice } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { str } from "@/lib/actions";

export async function deviceAction(formData: FormData): Promise<void> {
  const p = await requirePermissionPage("core.device.write");
  const id = str(formData, "id");
  const op = str(formData, "op");
  const patch =
    op === "approve" ? { approvalStatus: "approved" as const } : op === "reject" ? { approvalStatus: "rejected" as const } : op === "disable" ? { disabled: true } : op === "enable" ? { disabled: false } : {};
  await updateDevice(db(), id, patch, { userId: p.userId, ...(await requestMeta()) });
  revalidatePath("/admin/devices");
}
