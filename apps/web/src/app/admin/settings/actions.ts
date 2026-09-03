"use server";

import { revalidatePath } from "next/cache";
import { ValidationError, updateSetting } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function saveSettingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage(["system.settings", "security.admin"]);
    const key = str(formData, "key");
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(key)) throw new ValidationError("キーが不正です");
    let value: unknown;
    try {
      value = JSON.parse(str(formData, "value"));
    } catch {
      throw new ValidationError("JSONの形式が正しくありません");
    }
    await updateSetting(db(), key, value, { userId: p.userId, ...(await requestMeta()) });
    revalidatePath("/admin/settings");
    return { ok: true, message: `${key} を保存しました` };
  });
}
