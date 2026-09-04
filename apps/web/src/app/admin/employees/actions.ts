"use server";

import { revalidatePath } from "next/cache";
import { upsertEmployee } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { runAction, str, type ActionState } from "@/lib/actions";

export async function saveEmployeeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const p = await requirePermissionPage("core.employee.write");
    const status = (["active", "on_leave", "retired"] as const).find((s) => s === str(formData, "status")) ?? "active";
    await upsertEmployee(
      db(),
      {
        id: str(formData, "id") || undefined,
        employeeNumber: str(formData, "employeeNumber"),
        name: str(formData, "name"),
        nameKana: str(formData, "nameKana"),
        organizationId: str(formData, "organizationId"),
        departmentId: str(formData, "departmentId") || null,
        primaryLocationId: str(formData, "primaryLocationId") || null,
        employmentType: str(formData, "employmentType") || "full_time",
        hiredOn: str(formData, "hiredOn") || null,
        retiredOn: str(formData, "retiredOn") || null,
        status,
      },
      { userId: p.userId, ...(await requestMeta()) },
    );
    revalidatePath("/admin/employees");
    return { ok: true, message: "保存しました" };
  });
}
