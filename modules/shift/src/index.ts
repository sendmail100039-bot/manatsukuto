/**
 * Shift module (Phase 2 シフト管理).
 * Patterns (早番/日勤/遅番...) → per-employee shifts per day → comparison with attendance.
 */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  attendanceRecords,
  departments,
  employees,
  leaveRequests,
  locations,
  shiftPatterns,
  shifts,
  type Database,
  type DbExecutor,
} from "@platform/database";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  getSetting,
  hasPermission,
  parseLocalDateTime,
  writeAudit,
  type Principal,
  type RequestMeta,
} from "@platform/core";

type Actor = { userId: string } & RequestMeta;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------
export async function listShiftPatterns(db: DbExecutor, opts: { activeOnly?: boolean } = {}) {
  const q = db.select().from(shiftPatterns).orderBy(asc(shiftPatterns.startTime), asc(shiftPatterns.code));
  return opts.activeOnly ? q.where(eq(shiftPatterns.active, true)) : q;
}

export interface ShiftPatternInput {
  id?: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color?: string | null;
  organizationId?: string | null;
  active?: boolean;
}

export async function upsertShiftPattern(db: DbExecutor, input: ShiftPatternInput, actor: Actor) {
  if (!input.code.trim() || !input.name.trim()) throw new ValidationError("コードと名称は必須です");
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) throw new ValidationError("時刻は HH:mm 形式で指定してください");
  if (!Number.isInteger(input.breakMinutes) || input.breakMinutes < 0 || input.breakMinutes > 600) throw new ValidationError("休憩分が不正です");
  const values = {
    code: input.code.trim(),
    name: input.name.trim(),
    startTime: input.startTime,
    endTime: input.endTime,
    breakMinutes: input.breakMinutes,
    color: input.color?.trim() || null,
    organizationId: input.organizationId || null,
    active: input.active ?? true,
    updatedAt: new Date(),
  };
  const [row] = input.id
    ? await db.update(shiftPatterns).set(values).where(eq(shiftPatterns.id, input.id)).returning()
    : await db.insert(shiftPatterns).values(values).returning();
  if (!row) throw new NotFoundError("シフトパターン");
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "shift.pattern_updated", targetType: "shift_pattern", targetId: row.id, details: values });
  return row;
}

/** Resolve a pattern on a work date into absolute start/end (overnight patterns end the next day). */
export function patternToRange(workDate: string, pattern: { startTime: string; endTime: string }): { startAt: Date; endAt: Date } {
  const startAt = parseLocalDateTime(`${workDate}T${pattern.startTime}`);
  let endAt = parseLocalDateTime(`${workDate}T${pattern.endTime}`);
  if (!startAt || !endAt) throw new ValidationError("日付または時刻が不正です");
  if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  return { startAt, endAt };
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------
export interface AssignShiftInput {
  employeeId: string;
  workDate: string;
  patternId?: string | null;
  /** custom times when no pattern is used ("HH:mm") */
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number | null;
  locationId?: string | null;
  note?: string | null;
  publish?: boolean;
}

export async function assignShift(db: DbExecutor, principal: Principal, input: AssignShiftInput, meta: RequestMeta) {
  if (!hasPermission(principal, "shift.manage")) throw new ForbiddenError();
  if (!DATE_RE.test(input.workDate)) throw new ValidationError("勤務日が不正です");
  let range: { startAt: Date; endAt: Date };
  let breakMinutes = input.breakMinutes ?? 0;
  if (input.patternId) {
    const [pattern] = await db.select().from(shiftPatterns).where(eq(shiftPatterns.id, input.patternId));
    if (!pattern) throw new NotFoundError("シフトパターン");
    range = patternToRange(input.workDate, pattern);
    breakMinutes = input.breakMinutes ?? pattern.breakMinutes;
  } else {
    if (!input.startTime || !input.endTime || !TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
      throw new ValidationError("パターンまたは開始・終了時刻を指定してください");
    }
    range = patternToRange(input.workDate, { startTime: input.startTime, endTime: input.endTime });
  }
  const values = {
    employeeId: input.employeeId,
    workDate: input.workDate,
    patternId: input.patternId || null,
    startAt: range.startAt,
    endAt: range.endAt,
    breakMinutes,
    locationId: input.locationId || null,
    status: (input.publish ? "published" : "planned") as "published" | "planned",
    note: input.note?.trim() || null,
    createdByUserId: principal.userId,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(shifts)
    .values(values)
    .onConflictDoUpdate({ target: [shifts.employeeId, shifts.workDate], set: values })
    .returning();
  await writeAudit(db, { ...meta, actorUserId: principal.userId, action: "shift.assigned", targetType: "shift", targetId: row!.id, details: { employeeId: input.employeeId, workDate: input.workDate, patternId: input.patternId ?? null } });
  return row!;
}

/** Assign the same pattern to many employees over a date range (optionally only some weekdays). */
export async function bulkAssignShifts(
  db: Database,
  principal: Principal,
  input: { employeeIds: string[]; from: string; to: string; weekdays?: number[]; patternId: string; locationId?: string | null; publish?: boolean },
  meta: RequestMeta,
) {
  if (!hasPermission(principal, "shift.manage")) throw new ForbiddenError();
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to) || input.from > input.to) throw new ValidationError("期間が不正です");
  const days: string[] = [];
  for (let d = new Date(`${input.from}T00:00:00Z`); d <= new Date(`${input.to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const iso = d.toISOString().slice(0, 10);
    if (!input.weekdays || input.weekdays.includes(d.getUTCDay())) days.push(iso);
  }
  if (days.length > 62) throw new ValidationError("一括登録は 62 日以内にしてください");
  let count = 0;
  await db.transaction(async (tx) => {
    for (const employeeId of input.employeeIds) {
      for (const workDate of days) {
        await assignShift(tx, principal, { employeeId, workDate, patternId: input.patternId, locationId: input.locationId, publish: input.publish }, meta);
        count++;
      }
    }
  });
  return { count };
}

export async function cancelShift(db: DbExecutor, principal: Principal, shiftId: string, meta: RequestMeta) {
  if (!hasPermission(principal, "shift.manage")) throw new ForbiddenError();
  const [row] = await db.update(shifts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(shifts.id, shiftId)).returning();
  if (!row) throw new NotFoundError("シフト");
  await writeAudit(db, { ...meta, actorUserId: principal.userId, action: "shift.cancelled", targetType: "shift", targetId: shiftId });
  return row;
}

export async function publishShifts(db: DbExecutor, principal: Principal, filter: { from: string; to: string; organizationId?: string }, meta: RequestMeta) {
  if (!hasPermission(principal, "shift.manage")) throw new ForbiddenError();
  const ids = (
    await db
      .select({ id: shifts.id })
      .from(shifts)
      .innerJoin(employees, eq(employees.id, shifts.employeeId))
      .where(and(gte(shifts.workDate, filter.from), lte(shifts.workDate, filter.to), eq(shifts.status, "planned"), filter.organizationId ? eq(employees.organizationId, filter.organizationId) : undefined))
  ).map((r) => r.id);
  if (ids.length) await db.update(shifts).set({ status: "published", updatedAt: new Date() }).where(inArray(shifts.id, ids));
  await writeAudit(db, { ...meta, actorUserId: principal.userId, action: "shift.assigned", details: { published: ids.length, ...filter } });
  return { published: ids.length };
}

export interface ShiftFilter {
  from: string;
  to: string;
  employeeId?: string;
  organizationId?: string;
  departmentId?: string;
  includeCancelled?: boolean;
  /** employees only see published shifts */
  publishedOnly?: boolean;
}

export async function listShifts(db: DbExecutor, filter: ShiftFilter) {
  const conds = [gte(shifts.workDate, filter.from), lte(shifts.workDate, filter.to)];
  if (filter.employeeId) conds.push(eq(shifts.employeeId, filter.employeeId));
  if (filter.organizationId) conds.push(eq(employees.organizationId, filter.organizationId));
  if (filter.departmentId) conds.push(eq(employees.departmentId, filter.departmentId));
  if (!filter.includeCancelled) conds.push(sql`${shifts.status} <> 'cancelled'`);
  if (filter.publishedOnly) conds.push(eq(shifts.status, "published"));
  return db
    .select({
      shift: shifts,
      employeeName: employees.name,
      employeeNumber: employees.employeeNumber,
      departmentName: departments.name,
      patternName: shiftPatterns.name,
      patternColor: shiftPatterns.color,
      locationName: locations.name,
    })
    .from(shifts)
    .innerJoin(employees, eq(employees.id, shifts.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .leftJoin(shiftPatterns, eq(shiftPatterns.id, shifts.patternId))
    .leftJoin(locations, eq(locations.id, shifts.locationId))
    .where(and(...conds))
    .orderBy(asc(shifts.workDate), asc(employees.employeeNumber));
}

// ---------------------------------------------------------------------------
// Attendance vs shift evaluation
// ---------------------------------------------------------------------------
export type DayStatus = "on_time" | "late" | "early_leave" | "late_and_early" | "absent" | "leave" | "unscheduled" | "no_shift" | "open";

export interface DayEvaluation {
  employeeId: string;
  workDate: string;
  status: DayStatus;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  shiftId: string | null;
  recordId: string | null;
}

/**
 * Compares shifts with attendance records for a date range. Approved leave on a
 * shift day counts as "leave", a shift without a record (in the past) as "absent",
 * a record without a shift as "unscheduled". Grace minutes come from settings.
 */
export async function evaluateAttendance(db: DbExecutor, filter: { from: string; to: string; employeeId?: string; organizationId?: string; departmentId?: string }): Promise<DayEvaluation[]> {
  const settings = await getSetting<{ lateGraceMinutes: number; earlyLeaveGraceMinutes: number }>(db, "attendance.evaluation");
  const shiftRows = await listShifts(db, { ...filter, includeCancelled: false });
  const recConds = [gte(attendanceRecords.workDate, filter.from), lte(attendanceRecords.workDate, filter.to), sql`${attendanceRecords.status} <> 'superseded'`];
  if (filter.employeeId) recConds.push(eq(attendanceRecords.employeeId, filter.employeeId));
  if (filter.organizationId) recConds.push(eq(employees.organizationId, filter.organizationId));
  if (filter.departmentId) recConds.push(eq(employees.departmentId, filter.departmentId));
  const recRows = await db.select({ record: attendanceRecords }).from(attendanceRecords).innerJoin(employees, eq(employees.id, attendanceRecords.employeeId)).where(and(...recConds));
  const leaveConds = [eq(leaveRequests.status, "approved"), lte(leaveRequests.startDate, filter.to), gte(leaveRequests.endDate, filter.from)];
  if (filter.employeeId) leaveConds.push(eq(leaveRequests.employeeId, filter.employeeId));
  const leaves = await db.select().from(leaveRequests).where(and(...leaveConds));

  const key = (e: string, d: string) => `${e}|${d}`;
  const recByKey = new Map(recRows.map((r) => [key(r.record.employeeId, r.record.workDate), r.record]));
  const onLeave = (employeeId: string, date: string) => leaves.some((l) => l.employeeId === employeeId && l.startDate <= date && l.endDate >= date && !l.half);
  const today = new Date().toISOString().slice(0, 10);
  const out: DayEvaluation[] = [];
  const seen = new Set<string>();

  for (const s of shiftRows) {
    const k = key(s.shift.employeeId, s.shift.workDate);
    seen.add(k);
    const rec = recByKey.get(k);
    if (onLeave(s.shift.employeeId, s.shift.workDate)) {
      out.push({ employeeId: s.shift.employeeId, workDate: s.shift.workDate, status: "leave", lateMinutes: 0, earlyLeaveMinutes: 0, shiftId: s.shift.id, recordId: rec?.id ?? null });
      continue;
    }
    if (!rec) {
      out.push({ employeeId: s.shift.employeeId, workDate: s.shift.workDate, status: s.shift.workDate < today ? "absent" : "no_shift", lateMinutes: 0, earlyLeaveMinutes: 0, shiftId: s.shift.id, recordId: null });
      continue;
    }
    const lateMinutes = rec.clockInAt ? Math.max(0, Math.round((rec.clockInAt.getTime() - s.shift.startAt.getTime()) / 60_000) - settings.lateGraceMinutes) : 0;
    const earlyLeaveMinutes = rec.clockOutAt ? Math.max(0, Math.round((s.shift.endAt.getTime() - rec.clockOutAt.getTime()) / 60_000) - settings.earlyLeaveGraceMinutes) : 0;
    let status: DayStatus = "on_time";
    if (!rec.clockOutAt) status = "open";
    else if (lateMinutes > 0 && earlyLeaveMinutes > 0) status = "late_and_early";
    else if (lateMinutes > 0) status = "late";
    else if (earlyLeaveMinutes > 0) status = "early_leave";
    out.push({ employeeId: s.shift.employeeId, workDate: s.shift.workDate, status, lateMinutes, earlyLeaveMinutes, shiftId: s.shift.id, recordId: rec.id });
  }
  for (const r of recRows) {
    const k = key(r.record.employeeId, r.record.workDate);
    if (seen.has(k)) continue;
    out.push({ employeeId: r.record.employeeId, workDate: r.record.workDate, status: "unscheduled", lateMinutes: 0, earlyLeaveMinutes: 0, shiftId: null, recordId: r.record.id });
  }
  return out.sort((a, b) => (a.workDate === b.workDate ? a.employeeId.localeCompare(b.employeeId) : a.workDate.localeCompare(b.workDate)));
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  on_time: "定時",
  late: "遅刻",
  early_leave: "早退",
  late_and_early: "遅刻・早退",
  absent: "欠勤(打刻なし)",
  leave: "休暇",
  unscheduled: "シフト外勤務",
  no_shift: "予定",
  open: "出勤中",
};

export { ConflictError };
