import { auditLogs, type DbExecutor } from "@platform/database";
import type { RequestMeta } from "./context";

export type AuditAction =
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.mfa_enrolled"
  | "auth.mfa_verified"
  | "auth.password_changed"
  | "attendance.clock_in"
  | "attendance.clock_out"
  | "attendance.break"
  | "attendance.punch_rejected"
  | "attendance.request_created"
  | "attendance.request_cancelled"
  | "attendance.request_approved"
  | "attendance.request_rejected"
  | "attendance.exported"
  | "employee.created"
  | "employee.updated"
  | "organization.updated"
  | "location.created"
  | "location.updated"
  | "device.registered"
  | "device.updated"
  | "user.created"
  | "user.updated"
  | "user.role_changed"
  | "security.gps_anomaly"
  | "security.event_created"
  | "security.event_reviewed"
  | "security.gps_viewed"
  | "security.risk_viewed"
  | "security.dashboard_viewed"
  | "shift.pattern_updated"
  | "shift.assigned"
  | "shift.cancelled"
  | "leave.type_updated"
  | "leave.balance_granted"
  | "leave.request_created"
  | "leave.request_cancelled"
  | "leave.request_approved"
  | "leave.request_rejected"
  | "settings.updated";

export interface AuditEntry extends RequestMeta {
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string | null;
  details?: Record<string, unknown>;
}

/**
 * Append-only audit log (§34, §35). The table has a trigger that rejects UPDATE
 * and DELETE, so entries cannot be altered through the application.
 */
export async function writeAudit(db: DbExecutor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId ?? null,
    actorEmployeeId: entry.actorEmployeeId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ? entry.userAgent.slice(0, 512) : null,
    details: entry.details ?? null,
  });
}
