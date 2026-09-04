import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { employees, leaveTypes, shiftPatterns, users } from "@platform/database";
import { loadPermissions } from "@platform/auth";
import type { Principal } from "@platform/core";
import { recordPunch } from "@platform/attendance";
import { assignShift, bulkAssignShifts, evaluateAttendance, listShifts, patternToRange, publishShifts, cancelShift } from "@platform/shift";
import { balanceSummary, cancelLeaveRequest, createLeaveRequest, decideLeaveRequest, fiscalYearOf, grantLeaveBalance, halfDaysToText, listLeaveRequests } from "@platform/leave";
import { createTestDatabase, type TestDb } from "./helpers";

let t: TestDb;
const meta = { ipAddress: "203.0.113.30", userAgent: "vitest" };

async function principalFor(loginId: string): Promise<Principal> {
  const [u] = await t.db.select().from(users).where(eq(users.loginId, loginId));
  const { roles, permissions } = await loadPermissions(t.db, u!.id);
  return { userId: u!.id, employeeId: u!.employeeId, loginId, roles, permissions, mfaVerified: true, sessionId: "test" };
}
const jstDate = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

describe("shift module", () => {
  it("resolves patterns to absolute ranges, overnight patterns end next day", () => {
    const day = patternToRange("2026-09-10", { startTime: "09:00", endTime: "18:00" });
    expect(day.startAt.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(day.endAt.toISOString()).toBe("2026-09-10T09:00:00.000Z");
    const night = patternToRange("2026-09-10", { startTime: "21:00", endTime: "07:00" });
    expect(night.endAt.getTime() - night.startAt.getTime()).toBe(10 * 3_600_000);
  });

  it("manager assigns / bulk assigns / publishes; employee sees only published", async () => {
    const suzuki = await principalFor("suzuki");
    const yamada = await principalFor("yamada");
    const [day] = await t.db.select().from(shiftPatterns).where(eq(shiftPatterns.code, "DAY"));
    await expect(assignShift(t.db, yamada, { employeeId: yamada.employeeId!, workDate: jstDate(1), patternId: day!.id }, meta)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const s = await assignShift(t.db, suzuki, { employeeId: yamada.employeeId!, workDate: jstDate(1), patternId: day!.id }, meta);
    expect(s.status).toBe("planned");
    expect(s.breakMinutes).toBe(60);
    // re-assigning the same day replaces (upsert)
    const s2 = await assignShift(t.db, suzuki, { employeeId: yamada.employeeId!, workDate: jstDate(1), startTime: "10:00", endTime: "15:00", breakMinutes: 30 }, meta);
    expect(s2.id).toBe(s.id);
    expect(s2.breakMinutes).toBe(30);

    const bulk = await bulkAssignShifts(t.db, suzuki, { employeeIds: [yamada.employeeId!], from: jstDate(2), to: jstDate(8), weekdays: [1, 2, 3, 4, 5], patternId: day!.id }, meta);
    expect(bulk.count).toBe(5);
    expect(await listShifts(t.db, { from: jstDate(1), to: jstDate(8), employeeId: yamada.employeeId!, publishedOnly: true })).toHaveLength(0);
    const pub = await publishShifts(t.db, suzuki, { from: jstDate(1), to: jstDate(8) }, meta);
    expect(pub.published).toBe(6);
    expect(await listShifts(t.db, { from: jstDate(1), to: jstDate(8), employeeId: yamada.employeeId!, publishedOnly: true })).toHaveLength(6);
    await cancelShift(t.db, suzuki, s.id, meta);
    expect(await listShifts(t.db, { from: jstDate(1), to: jstDate(1), employeeId: yamada.employeeId! })).toHaveLength(0);
  });

  it("evaluates attendance against shifts (late / unscheduled / absent)", async () => {
    const suzuki = await principalFor("suzuki");
    const sato = await principalFor("sato");
    const today = jstDate(0);
    // shift that started 3 hours ago → punching now is late
    const now = new Date();
    const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace("24:", "00:");
    const start = new Date(now.getTime() - 3 * 3_600_000);
    const end = new Date(now.getTime() + 5 * 3_600_000);
    if (jstDate(0) !== new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(start)) return; // skip around midnight
    await assignShift(t.db, suzuki, { employeeId: sato.employeeId!, workDate: today, startTime: hhmm(start), endTime: hhmm(end), publish: true }, meta);
    await recordPunch(t.db, sato, { type: "clock_in", requestId: randomUUID(), clientTime: now.toISOString(), gps: null, device: { deviceKey: "d-sato" } }, meta);
    let evals = await evaluateAttendance(t.db, { from: today, to: today, employeeId: sato.employeeId! });
    expect(evals[0]?.status).toBe("open");
    expect(evals[0]?.lateMinutes).toBeGreaterThanOrEqual(179);
    await recordPunch(t.db, sato, { type: "clock_out", requestId: randomUUID(), clientTime: new Date().toISOString(), gps: null, device: { deviceKey: "d-sato" } }, meta);
    evals = await evaluateAttendance(t.db, { from: today, to: today, employeeId: sato.employeeId! });
    expect(evals[0]?.status).toBe("late_and_early");
    expect(evals[0]?.earlyLeaveMinutes).toBeGreaterThanOrEqual(299);

    // past shift without a record → absent
    await assignShift(t.db, suzuki, { employeeId: sato.employeeId!, workDate: jstDate(-3), startTime: "09:00", endTime: "18:00", publish: true }, meta);
    const past = await evaluateAttendance(t.db, { from: jstDate(-3), to: jstDate(-3), employeeId: sato.employeeId! });
    expect(past[0]?.status).toBe("absent");
  });
});

describe("leave module", () => {
  it("fiscal year helper", () => {
    expect(fiscalYearOf("2026-04-01", 4)).toBe(2026);
    expect(fiscalYearOf("2026-03-31", 4)).toBe(2025);
    expect(fiscalYearOf("2026-01-15", 1)).toBe(2026);
    expect(halfDaysToText(3)).toBe("1.5");
    expect(halfDaysToText(20)).toBe("10");
  });

  it("request → approve deducts balance; pending reserves; overdraw refused; cancel restores", async () => {
    const yamada = await principalFor("yamada");
    const suzuki = await principalFor("suzuki");
    const takahashi = await principalFor("takahashi");
    const [annual] = await t.db.select().from(leaveTypes).where(eq(leaveTypes.code, "ANNUAL"));
    const start = jstDate(10);
    const fy = fiscalYearOf(start, 4);
    // no balance yet
    await expect(createLeaveRequest(t.db, yamada, { leaveTypeId: annual!.id, startDate: start, endDate: start }, meta)).rejects.toMatchObject({ code: "CONFLICT" });
    await grantLeaveBalance(t.db, { employeeId: yamada.employeeId!, leaveTypeId: annual!.id, fiscalYear: fy, grantedHalfDays: 4 }, { userId: takahashi.userId, ...meta }); // 2 days

    const r1 = await createLeaveRequest(t.db, yamada, { leaveTypeId: annual!.id, startDate: start, endDate: start, half: "am", reason: "通院" }, meta);
    expect(r1.halfDays).toBe(1);
    let sum = await balanceSummary(t.db, yamada.employeeId!, fy);
    expect(sum[0]?.pendingHalfDays).toBe(1);
    expect(sum[0]?.remainingHalfDays).toBe(3);
    // overlapping request refused
    await expect(createLeaveRequest(t.db, yamada, { leaveTypeId: annual!.id, startDate: start, endDate: jstDate(11) }, meta)).rejects.toMatchObject({ code: "CONFLICT" });
    // 2 more days would exceed (3 half days left)
    await expect(createLeaveRequest(t.db, yamada, { leaveTypeId: annual!.id, startDate: jstDate(12), endDate: jstDate(13) }, meta)).rejects.toMatchObject({ code: "CONFLICT" });
    const r2 = await createLeaveRequest(t.db, yamada, { leaveTypeId: annual!.id, startDate: jstDate(12), endDate: jstDate(12) }, meta);
    expect(r2.halfDays).toBe(2);

    await expect(decideLeaveRequest(t.db, yamada, r1.id, "approved", "", meta)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await decideLeaveRequest(t.db, suzuki, r1.id, "approved", "OK", meta);
    await decideLeaveRequest(t.db, suzuki, r2.id, "rejected", "人員不足", meta);
    sum = await balanceSummary(t.db, yamada.employeeId!, fy);
    expect(sum[0]?.balance.usedHalfDays).toBe(1);
    expect(sum[0]?.pendingHalfDays).toBe(0);
    expect(sum[0]?.remainingHalfDays).toBe(3);

    // cancel approved future leave restores balance
    await cancelLeaveRequest(t.db, yamada, r1.id, meta);
    sum = await balanceSummary(t.db, yamada.employeeId!, fy);
    expect(sum[0]?.balance.usedHalfDays).toBe(0);
    const all = await listLeaveRequests(t.db, { employeeId: yamada.employeeId! });
    expect(all.map((r) => r.request.status).sort()).toEqual(["cancelled", "rejected"]);
  });

  it("types without balance are unlimited; approved leave shows in attendance evaluation", async () => {
    const yamada = await principalFor("yamada");
    const suzuki = await principalFor("suzuki");
    const [special] = await t.db.select().from(leaveTypes).where(eq(leaveTypes.code, "SPECIAL"));
    const [day] = await t.db.select().from(shiftPatterns).where(eq(shiftPatterns.code, "DAY"));
    const d = jstDate(20);
    await assignShift(t.db, suzuki, { employeeId: yamada.employeeId!, workDate: d, patternId: day!.id, publish: true }, meta);
    const r = await createLeaveRequest(t.db, yamada, { leaveTypeId: special!.id, startDate: d, endDate: d, reason: "忌引" }, meta);
    await decideLeaveRequest(t.db, suzuki, r.id, "approved", "", meta);
    const evals = await evaluateAttendance(t.db, { from: d, to: d, employeeId: yamada.employeeId! });
    expect(evals[0]?.status).toBe("leave");
    void employees;
  });
});
