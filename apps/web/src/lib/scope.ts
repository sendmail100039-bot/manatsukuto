import { eq } from "drizzle-orm";
import { employees } from "@platform/database";
import { hasPermission, type Principal } from "@platform/core";
import { db } from "./db";

/**
 * Manager visibility scope: managers see their own organization; head office /
 * security / system admins (attendance.all.read) see everything.
 */
export async function managerScope(p: Principal): Promise<{ organizationId?: string }> {
  if (hasPermission(p, "attendance.all.read")) return {};
  if (!p.employeeId) return { organizationId: "00000000-0000-0000-0000-000000000000" };
  const [me] = await db().select({ organizationId: employees.organizationId }).from(employees).where(eq(employees.id, p.employeeId));
  return { organizationId: me?.organizationId ?? "00000000-0000-0000-0000-000000000000" };
}
