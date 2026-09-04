"use server";

import { revalidatePath } from "next/cache";
import { upsertDepartment, upsertOrganization } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { bool, runAction, str, type ActionState } from "@/lib/actions";

export async function saveOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.organization.write");
    await upsertOrganization(
      db(),
      { id: str(formData, "id") || undefined, code: str(formData, "code"), name: str(formData, "name"), kind: str(formData, "kind") || "corporation", parentId: str(formData, "parentId") || null, active: bool(formData, "active") },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/admin/organizations");
    return { ok: true, message: "保存しました" };
  });
}

export async function saveDepartmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.organization.write");
    await upsertDepartment(
      db(),
      { id: str(formData, "id") || undefined, organizationId: str(formData, "organizationId"), code: str(formData, "code"), name: str(formData, "name"), parentId: str(formData, "parentId") || null, active: bool(formData, "active") },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/admin/organizations");
    return { ok: true, message: "保存しました" };
  });
}
