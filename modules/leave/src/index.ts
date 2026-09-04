/**
 * Leave module (Phase 2 休暇申請・有休管理).
 * Balances are kept in half-day units (integer) so 0.5 day requests never drift.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import {
  departments,
  employees,
  leaveApprovals,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  users,
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
  writeAudit,
  type Principal,
  type RequestMeta,
} from "@platform/core";

type Actor = { userId: string } & RequestMeta;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const halfDaysToText = (h: number) => (h % 2 === 0 ? `${h / 2}` : `${Math.floor(h / 2)}.5`);

/** Fiscal year of a date given the configured start month (default April). */
export function fiscalYearOf(date: string, startMonth: number): number {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  return m >= startMonth ? y : y - 1;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export async function listLeaveTypes(db: DbExecutor, opts: { activeOnly?: boolean } = {}) {
  const q = db.select().from(leaveTypes).orderBy(asc(leaveTypes.code));
  return opts.activeOnly ? q.where(eq(leaveTypes.active, true)) : q;
}

export interface LeaveTypeInput {
  id?: string;
  code: string;
  name: string;
  paid?: boolean;
  requiresBalance?: boolean;
  allowHalfDay?: boolean;
  active?: boolean;
}

export async function upsertLeaveType(db: DbExecutor, input: LeaveTypeInput, actor: Actor) {
  if (!input.code.trim() || !input.name.trim()) throw new ValidationError("コードと名称は必須です");
  const values = { code: input.code.trim(), name: input.name.trim(), paid: input.paid ?? true, requiresBalance: input.requiresBalance ?? true, allowHalfDay: input.allowHalfDay ?? true, active: input.active ?? true, updatedAt: new Date() };
  const [row] = input.id
    ? await db.update(leaveTypes).set(values).where(eq(leaveTypes.id, input.id)).returning()
    : await db.insert(leaveTypes).values(values).returning();
  if (!row) throw new NotFoundError("休暇種別");
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "leave.type_updated", targetType: "leave_type", targetId: row.id, details: values });
  return row;
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------
export async function grantLeaveBalance(
  db: DbExecutor,
  input: { employeeId: string; leaveTypeId: string; fiscalYear: number; grantedHalfDays: number; validFrom?: string | null; expiresOn?: string | null; note?: string | null },
  actor: Actor,
) {
  if (!Number.isInteger(input.grantedHalfDays) || input.grantedHalfDays < 0 || input.grantedHalfDays > 200) throw new ValidationError("付与日数が不正です");
  const values = { ...input, validFrom: input.validFrom || null, expiresOn: input.expiresOn || null, note: input.note?.trim() || null, updatedAt: new Date() };
  const [row] = await db
    .insert(leaveBalances)
    .values(values)
    .onConflictDoUpdate({ target: [leaveBalances.employeeId, leaveBalances.leaveTypeId, leaveBalances.fiscalYear], set: { grantedHalfDays: input.grantedHalfDays, validFrom: values.validFrom, expiresOn: values.expiresOn, note: values.note, updatedAt: new Date() } })
    .returning();
  await writeAudit(db, { ...actor, actorUserId: actor.userId, action: "leave.balance_granted", targetType: "leave_balance", targetId: row!.id, details: input });
  return row!;
}

export async function listBalances(db: DbExecutor, filter: { employeeId?: string; fiscalYear?: number; organizationId?: string } = {}) {
  const conds = [];
  if (filter.employeeId) conds.push(eq(leaveBalances.employeeId, filter.employeeId));
  if (filter.fiscalYear) conds.push(eq(leaveBalances.fiscalYear, filter.fiscalYear));
  if (filter.organizationId) conds.push(eq(employees.organizationId, filter.organizationId));
  return db
    .select({ balance: leaveBalances, typeName: leaveTypes.name, typeCode: leaveTypes.code, employeeName: employees.name, employeeNumber: employees.employeeNumber })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveBalances.leaveTypeId))
    .innerJoin(employees, eq(employees.id, leaveBalances.employeeId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leaveBalances.fiscalYear), asc(employees.employeeNumber), asc(leaveTypes.code));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
export interface LeaveRequestInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  half?: "am" | "pm" | null;
  reason?: string | null;
}

function countDays(start: string, end: string): number {
  return Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

export async function createLeaveRequest(db: Database, principal: Principal, input: LeaveRequestInput, meta: RequestMeta) {
  if (!principal.employeeId) throw new ValidationError("職員情報が紐づいていません");
  if (!hasPermission(principal, "leave.self.request")) throw new ForbiddenError();
  if (!DATE_RE.test(input.startDate) || !DATE_RE.test(input.endDate) || input.endDate < input.startDate) throw new ValidationError("期間が不正です");
  const [type] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.id, input.leaveTypeId), eq(leaveTypes.active, true)));
  if (!type) throw new NotFoundError("休暇種別");
  const days = countDays(input.startDate, input.endDate);
  if (days > 60) throw new ValidationError("一度に申請できるのは 60 日までです");
  if (input.half && (days !== 1 || !type.allowHalfDay)) throw new ValidationError("半休は 1 日のみ、かつ半休可能な種別で申請してください");
  const halfDays = input.half ? 1 : days * 2;

  return db.transaction(async (tx) => {
    // overlap with other pending/approved requests
    const [overlap] = await tx
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.employeeId, principal.employeeId!), sql`${leaveRequests.status} in ('pending','approved')`, lte(leaveRequests.startDate, input.endDate), gte(leaveRequests.endDate, input.startDate)))
      .limit(1);
    if (overlap) throw new ConflictError("同じ期間に申請済みの休暇があります");

    let balanceId: string | null = null;
    if (type.requiresBalance) {
      const { fiscalYearStartMonth } = await getSetting<{ fiscalYearStartMonth: number }>(tx, "attendance.evaluation");
      const fy = fiscalYearOf(input.startDate, fiscalYearStartMonth);
      const [bal] = await tx
        .select()
        .from(leaveBalances)
        .where(and(eq(leaveBalances.employeeId, principal.employeeId!), eq(leaveBalances.leaveTypeId, type.id), eq(leaveBalances.fiscalYear, fy)))
        .for("update");
      if (!bal) throw new ConflictError(`${fy}年度の${type.name}が付与されていません`);
      // pending requests also reserve balance so two overlapping approvals cannot overdraw
      const [{ reserved } = { reserved: 0 }] = await tx
        .select({ reserved: sql<number>`coalesce(sum(${leaveRequests.halfDays}), 0)::int` })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.balanceId, bal.id), eq(leaveRequests.status, "pending")));
      const remaining = bal.grantedHalfDays - bal.usedHalfDays - reserved;
      if (remaining < halfDays) throw new ConflictError(`残日数が不足しています(残 ${halfDaysToText(Math.max(0, remaining))} 日、申請 ${halfDaysToText(halfDays)} 日)`);
      balanceId = bal.id;
    }
    const [req] = await tx
      .insert(leaveRequests)
      .values({ employeeId: principal.employeeId!, leaveTypeId: type.id, balanceId, startDate: input.startDate, endDate: input.endDate, half: input.half ?? null, halfDays, reason: input.reason?.trim().slice(0, 1000) || null, requestedByUserId: principal.userId })
      .returning();
    await writeAudit(tx, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: "leave.request_created", targetType: "leave_request", targetId: req!.id, details: { type: type.code, startDate: input.startDate, endDate: input.endDate, halfDays } });
    return req!;
  });
}

export async function cancelLeaveRequest(db: Database, principal: Principal, requestId: string, meta: RequestMeta) {
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId)).for("update");
    if (!req || req.employeeId !== principal.employeeId) throw new NotFoundError("申請");
    if (req.status === "cancelled" || req.status === "rejected") throw new ConflictError("処理済みの申請は取り消せません");
    if (req.status === "approved") {
      const today = new Date().toISOString().slice(0, 10);
      if (req.startDate <= today) throw new ConflictError("開始日を過ぎた承認済み休暇は取り消せません。管理者に連絡してください。");
      if (req.balanceId) await tx.update(leaveBalances).set({ usedHalfDays: sql`${leaveBalances.usedHalfDays} - ${req.halfDays}`, updatedAt: new Date() }).where(eq(leaveBalances.id, req.balanceId));
    }
    await tx.update(leaveRequests).set({ status: "cancelled", updatedAt: new Date() }).where(eq(leaveRequests.id, requestId));
    await writeAudit(tx, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: "leave.request_cancelled", targetType: "leave_request", targetId: requestId });
  });
}

export async function decideLeaveRequest(db: Database, principal: Principal, requestId: string, decision: "approved" | "rejected", comment: string, meta: RequestMeta) {
  if (!hasPermission(principal, "leave.approve")) throw new ForbiddenError();
  return db.transaction(async (tx) => {
    const [req] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, requestId)).for("update");
    if (!req) throw new NotFoundError("申請");
    if (req.status !== "pending") throw new ConflictError("この申請はすでに処理されています");
    if (req.employeeId === principal.employeeId) throw new ForbiddenError("自分の申請は承認できません");
    if (decision === "approved" && req.balanceId) {
      const [bal] = await tx.select().from(leaveBalances).where(eq(leaveBalances.id, req.balanceId)).for("update");
      if (!bal || bal.grantedHalfDays - bal.usedHalfDays < req.halfDays) throw new ConflictError("残日数が不足しているため承認できません");
      await tx.update(leaveBalances).set({ usedHalfDays: bal.usedHalfDays + req.halfDays, updatedAt: new Date() }).where(eq(leaveBalances.id, bal.id));
    }
    await tx.update(leaveRequests).set({ status: decision, updatedAt: new Date() }).where(eq(leaveRequests.id, requestId));
    const [approval] = await tx.insert(leaveApprovals).values({ requestId, approverUserId: principal.userId, decision, comment: comment.slice(0, 1000) || null }).returning();
    await writeAudit(tx, { ...meta, actorUserId: principal.userId, actorEmployeeId: principal.employeeId, action: decision === "approved" ? "leave.request_approved" : "leave.request_rejected", targetType: "leave_request", targetId: requestId, details: { comment } });
    return approval!;
  });
}

export async function listLeaveRequests(db: DbExecutor, filter: { employeeId?: string; status?: "pending" | "approved" | "rejected" | "cancelled"; organizationId?: string; from?: string; to?: string } = {}) {
  const conds = [];
  if (filter.employeeId) conds.push(eq(leaveRequests.employeeId, filter.employeeId));
  if (filter.status) conds.push(eq(leaveRequests.status, filter.status));
  if (filter.organizationId) conds.push(eq(employees.organizationId, filter.organizationId));
  if (filter.from) conds.push(gte(leaveRequests.endDate, filter.from));
  if (filter.to) conds.push(lte(leaveRequests.startDate, filter.to));
  return db
    .select({ request: leaveRequests, typeName: leaveTypes.name, employeeName: employees.name, employeeNumber: employees.employeeNumber, departmentName: departments.name })
    .from(leaveRequests)
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .leftJoin(departments, eq(departments.id, employees.departmentId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(leaveRequests.createdAt));
}

export async function getLeaveRequestApprovals(db: DbExecutor, requestId: string) {
  return db
    .select({ approval: leaveApprovals, approverLogin: users.loginId })
    .from(leaveApprovals)
    .leftJoin(users, eq(users.id, leaveApprovals.approverUserId))
    .where(eq(leaveApprovals.requestId, requestId));
}

/** Balance summary per type for an employee (remaining = granted − used − pending). */
export async function balanceSummary(db: DbExecutor, employeeId: string, fiscalYear: number) {
  const rows = await listBalances(db, { employeeId, fiscalYear });
  const pending = await db
    .select({ balanceId: leaveRequests.balanceId, halfDays: sql<number>`coalesce(sum(${leaveRequests.halfDays}), 0)::int` })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.status, "pending")))
    .groupBy(leaveRequests.balanceId);
  const pendingBy = new Map(pending.map((p) => [p.balanceId, p.halfDays]));
  return rows.map((r) => {
    const reserved = pendingBy.get(r.balance.id) ?? 0;
    return { ...r, pendingHalfDays: reserved, remainingHalfDays: r.balance.grantedHalfDays - r.balance.usedHalfDays - reserved };
  });
}
