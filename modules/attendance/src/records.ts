import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  attendanceApprovals,
  attendanceRecords,
  attendanceRequests,
  departments,
  employees,
  locations,
  users,
  type Database,
  type DbExecutor,
} from "@platform/database";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  formatDateTime,
  formatTime,
  hasPermission,
  writeAudit,
  type Principal,
  type RequestMeta,
} from "@platform/core";

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------
export interface RecordFilter {
  employeeId?: string;
  departmentId?: string;
  from: string; // YYYY-MM-DD
  to: string;
  includeSuperseded?: boolean;
}

export async function listRecords(db: DbExecutor, filter: RecordFilter) {
  const conds = [gte(attendanceRecords.workDate, filter.from), lte(attendanceRecords.workDate, filter.to)];
  if (filter.employeeId) conds.push(eq(attendanceRecords.employeeId, filter.employeeId));
  if (filter.departmentId) conds.push(eq(employees.departmentId, filter.departmentId));
  if (!filter.includeSuperseded) conds.push(sql`${attendanceRecords.status} <> 'superseded'`);
  return db
    .select({
      record: attendanceRecords,
      employeeName: employees.name,
      employeeNumber: employees.employeeNumber,
      departmentName: departments.name,
      locationName: locations.name,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(locations, eq(locations.id, attendanceRecords.locationId))
    .where(and(...conds))
    .orderBy(desc(attendanceRecords.workDate), asc(employees.employeeNumber), desc(attendanceRecords.version));
}

/** Authorization helper: who may read a given employee's attendance. */
export async function canReadEmployeeAttendance(db: DbExecutor, principal: Principal, employeeId: string): Promise<boolean> {
  if (principal.employeeId === employeeId && hasPermission(principal, "attendance.self.read")) return true;
  if (hasPermission(principal, "attendance.all.read")) return true;
  if (hasPermission(principal, "attendance.team.read")) {
    // Manager scope: same department as the manager's own employee record.
    if (!principal.employeeId) return false;
    const [me] = await db.select({ departmentId: employees.departmentId, organizationId: employees.organizationId }).from(employees).where(eq(employees.id, principal.employeeId));
    const [target] = await db.select({ departmentId: employees.departmentId, organizationId: employees.organizationId }).from(employees).where(eq(employees.id, employeeId));
    if (!me || !target) return false;
    return me.organizationId === target.organizationId;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CSV export (§55) - RFC 4180, UTF-8 with BOM for Excel on Windows
// ---------------------------------------------------------------------------
export function toCsv(rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export async function exportRecordsCsv(db: DbExecutor, filter: RecordFilter, actor: { userId: string } & RequestMeta) {
  const rows = await listRecords(db, filter);
  const header = ["勤務日", "職員番号", "氏名", "部署", "拠点", "出勤", "退勤", "休憩(分)", "実働(分)", "状態", "版", "備考"];
  const body = rows.map((r) => [
    r.record.workDate,
    r.employeeNumber,
    r.employeeName,
    r.departmentName ?? "",
    r.locationName ?? "",
    formatDateTime(r.record.clockInAt),
    formatDateTime(r.record.clockOutAt),
    String(r.record.breakMinutes),
    workedMinutes(r.record) == null ? "" : String(workedMinutes(r.record)),
    r.record.status,
    String(r.record.version),
    r.record.note ?? "",
  ]);
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "attendance.exported", details: { ...filter, rows: rows.length } });
  return toCsv([header, ...body]);
}

// ---------------------------------------------------------------------------
// Correction requests (§36): original data is never overwritten.
// ---------------------------------------------------------------------------
export interface CorrectionInput {
  type: "correct_time" | "add_missing" | "cancel_record";
  recordId?: string | null;
  workDate: string;
  requestedClockInAt?: Date | null;
  requestedClockOutAt?: Date | null;
  reason: string;
}

export async function createCorrectionRequest(db: Database, principal: Principal, input: CorrectionInput, meta: RequestMeta) {
  if (!principal.employeeId) throw new ValidationError("職員情報が紐づいていません");
  if (!hasPermission(principal, "attendance.self.request")) throw new ForbiddenError();
  if (!input.reason || input.reason.trim().length < 2) throw new ValidationError("修正理由を入力してください");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) throw new ValidationError("勤務日が不正です");
  if (input.type !== "cancel_record") {
    if (!input.requestedClockInAt && !input.requestedClockOutAt) throw new ValidationError("修正後の出勤または退勤時刻を入力してください");
    if (input.requestedClockInAt && input.requestedClockOutAt && input.requestedClockOutAt <= input.requestedClockInAt) {
      throw new ValidationError("退勤時刻は出勤時刻より後にしてください");
    }
  }
  if (input.type !== "add_missing") {
    if (!input.recordId) throw new ValidationError("対象の勤怠記録を指定してください");
    const [rec] = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, input.recordId));
    if (!rec || rec.employeeId !== principal.employeeId) throw new NotFoundError("勤怠記録");
    if (rec.status === "superseded") throw new ConflictError("この記録はすでに修正済みです");
    const [pending] = await db
      .select({ id: attendanceRequests.id })
      .from(attendanceRequests)
      .where(and(eq(attendanceRequests.recordId, rec.id), eq(attendanceRequests.status, "pending")));
    if (pending) throw new ConflictError("この記録には未処理の申請があります");
  }
  const [req] = await db
    .insert(attendanceRequests)
    .values({
      employeeId: principal.employeeId,
      recordId: input.recordId ?? null,
      requestedByUserId: principal.userId,
      type: input.type,
      workDate: input.workDate,
      requestedClockInAt: input.requestedClockInAt ?? null,
      requestedClockOutAt: input.requestedClockOutAt ?? null,
      reason: input.reason.trim().slice(0, 1000),
    })
    .returning();
  await writeAudit(db, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: "attendance.request_created", targetType: "attendance_request", targetId: req!.id, details: { type: input.type, recordId: input.recordId } });
  return req!;
}

export async function cancelCorrectionRequest(db: Database, principal: Principal, requestId: string, meta: RequestMeta) {
  const [req] = await db.select().from(attendanceRequests).where(eq(attendanceRequests.id, requestId));
  if (!req || req.employeeId !== principal.employeeId) throw new NotFoundError("申請");
  if (req.status !== "pending") throw new ConflictError("処理済みの申請は取り消せません");
  await db.update(attendanceRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(attendanceRequests.id, requestId));
  await writeAudit(db, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: "attendance.request_cancelled", targetType: "attendance_request", targetId: requestId });
}

export async function listCorrectionRequests(db: DbExecutor, filter: { employeeId?: string; status?: "pending" | "approved" | "rejected" | "cancelled"; organizationId?: string } = {}) {
  const conds = [];
  if (filter.employeeId) conds.push(eq(attendanceRequests.employeeId, filter.employeeId));
  if (filter.status) conds.push(eq(attendanceRequests.status, filter.status));
  if (filter.organizationId) conds.push(eq(employees.organizationId, filter.organizationId));
  return db
    .select({
      request: attendanceRequests,
      employeeName: employees.name,
      employeeNumber: employees.employeeNumber,
      record: attendanceRecords,
    })
    .from(attendanceRequests)
    .innerJoin(employees, eq(employees.id, attendanceRequests.employeeId))
    .leftJoin(attendanceRecords, eq(attendanceRecords.id, attendanceRequests.recordId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(attendanceRequests.createdAt));
}

/**
 * Approve or reject. Approval creates a *new* record version and marks the
 * original as superseded; the approval row keeps a snapshot of the original.
 */
export async function decideCorrectionRequest(
  db: Database,
  principal: Principal,
  requestId: string,
  decision: "approved" | "rejected",
  comment: string,
  meta: RequestMeta,
) {
  if (!hasPermission(principal, "attendance.request.approve")) throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(attendanceRequests).where(eq(attendanceRequests.id, requestId)).for("update");
    if (!req) throw new NotFoundError("申請");
    if (req.status !== "pending") throw new ConflictError("この申請はすでに処理されています");
    if (req.employeeId === principal.employeeId) throw new ForbiddenError("自分の申請は承認できません");
    if (!(await canReadEmployeeAttendance(tx, principal, req.employeeId))) throw new ForbiddenError();

    let newRecordId: string | null = null;
    let snapshot: unknown = null;
    if (decision === "approved") {
      const original = req.recordId ? (await tx.select().from(attendanceRecords).where(eq(attendanceRecords.id, req.recordId)))[0] : undefined;
      snapshot = original ?? null;
      if (req.type === "cancel_record") {
        if (!original) throw new NotFoundError("勤怠記録");
        await tx.update(attendanceRecords).set({ status: "superseded", updatedAt: new Date() }).where(eq(attendanceRecords.id, original.id));
      } else {
        const [created] = await tx
          .insert(attendanceRecords)
          .values({
            employeeId: req.employeeId,
            workDate: req.workDate,
            locationId: original?.locationId ?? null,
            clockInEventId: original?.clockInEventId ?? null,
            clockOutEventId: original?.clockOutEventId ?? null,
            clockInAt: req.requestedClockInAt ?? original?.clockInAt ?? null,
            clockOutAt: req.requestedClockOutAt ?? original?.clockOutAt ?? null,
            status: "closed",
            version: (original?.version ?? 0) + 1,
            supersedesRecordId: original?.id ?? null,
            note: `修正申請 ${req.id} により${original ? "修正" : "追加"}`,
          })
          .returning();
        newRecordId = created!.id;
        if (original) {
          await tx
            .update(attendanceRecords)
            .set({ status: "superseded", supersededByRecordId: created!.id, updatedAt: new Date() })
            .where(eq(attendanceRecords.id, original.id));
        }
      }
    }
    await tx.update(attendanceRequests).set({ status: decision, updatedAt: new Date() }).where(eq(attendanceRequests.id, requestId));
    const [approval] = await tx
      .insert(attendanceApprovals)
      .values({ requestId, approverUserId: principal.userId, decision, comment: comment.slice(0, 1000) || null, originalRecordSnapshot: snapshot, newRecordId })
      .returning();
    await writeAudit(tx, {
      ...meta,
      actorUserId: principal.userId,
      actorEmployeeId: principal.employeeId,
      action: decision === "approved" ? "attendance.request_approved" : "attendance.request_rejected",
      targetType: "attendance_request",
      targetId: requestId,
      details: { newRecordId, comment },
    });
    return approval!;
  });
}

export async function getRequestWithApprovals(db: DbExecutor, requestId: string) {
  const [req] = await db.select().from(attendanceRequests).where(eq(attendanceRequests.id, requestId));
  if (!req) throw new NotFoundError("申請");
  const approvals = await db
    .select({ approval: attendanceApprovals, approverLogin: users.loginId })
    .from(attendanceApprovals)
    .leftJoin(users, eq(users.id, attendanceApprovals.approverUserId))
    .where(eq(attendanceApprovals.requestId, requestId));
  return { request: req, approvals };
}

export async function recordsByIds(db: DbExecutor, ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(attendanceRecords).where(inArray(attendanceRecords.id, ids));
}

/** Worked minutes = clock-out − clock-in − breaks (null while still open). */
export function workedMinutes(r: { clockInAt: Date | null; clockOutAt: Date | null; breakMinutes: number }): number | null {
  if (!r.clockInAt || !r.clockOutAt) return null;
  return Math.max(0, Math.round((r.clockOutAt.getTime() - r.clockInAt.getTime()) / 60_000) - r.breakMinutes);
}

export { formatTime };
