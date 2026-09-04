"use server";

import { revalidatePath } from "next/cache";
import { upsertLocation } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { bool, num, runAction, str, type ActionState } from "@/lib/actions";

export async function saveLocationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.location.write");
    await upsertLocation(
      db(),
      {
        id: str(formData, "id") || undefined,
        code: str(formData, "code"),
        name: str(formData, "name"),
        address: str(formData, "address"),
        latitude: num(formData, "latitude"),
        longitude: num(formData, "longitude"),
        radiusMeters: Math.round(num(formData, "radiusMeters")),
        validFrom: str(formData, "validFrom") || null,
        validTo: str(formData, "validTo") || null,
        punchAllowed: bool(formData, "punchAllowed"),
        organizationId: str(formData, "organizationId") || null,
      },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/manager/locations");
    return { ok: true, message: "保存しました" };
  });
}
