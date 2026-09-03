import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { attendanceEvents, attendanceRecords, auditLogs, devices, riskAssessments, securityEvents, users } from "@platform/database";
import { loadPermissions } from "@platform/auth";
import type { Principal } from "@platform/core";
import {
  recordPunch,
  getPunchState,
  createCorrectionRequest,
  decideCorrectionRequest,
  listRecords,
  exportRecordsCsv,
  listCorrectionRequests,
  getRequestWithApprovals,
} from "@platform/attendance";
import { dashboardSummary, listSecurityEvents, getSecurityEventDetail, reviewSecurityEvent } from "@platform/security";
import { createTestDatabase, type TestDb } from "./helpers";

let t: TestDb;
const meta = { ipAddress: "203.0.113.10", userAgent: "vitest" };

async function principalFor(loginId: string): Promise<Principal> {
  const [u] = await t.db.select().from(users).where(eq(users.loginId, loginId));
  const { roles, permissions } = await loadPermissions(t.db, u!.id);
  return { userId: u!.id, employeeId: u!.employeeId, loginId, roles, permissions, mfaVerified: true, sessionId: "test" };
}

const HIMEJI = { latitude: 34.8394, longitude: 134.6939 };
const OSAKA = { latitude: 34.7024, longitude: 135.4959 };
const device = { deviceKey: "dev-yamada-1", os: "iOS", osVersion: "18", appVersion: "0.1.0", userAgent: "vitest" };
type PunchInput = Parameters<typeof recordPunch>[2];
const punch = (type: "clock_in" | "clock_out", gps: PunchInput["gps"], extra: Partial<PunchInput> = {}): PunchInput => ({
  type,
  requestId: randomUUID(),
  clientTime: new Date().toISOString(),
  gps,
  device,
  ...extra,
});

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

describe("migrations & seed", () => {
  it("creates roles, permissions, settings and demo users", async () => {
    const rows = await t.db.select().from(users);
    expect(rows.map((r) => r.loginId).sort()).toEqual(["admin", "sato", "suzuki", "takahashi", "yamada"]);
    const admin = await principalFor("admin");
    expect(admin.roles).toEqual(["system_admin"]);
    expect(admin.permissions.has("system.audit.read")).toBe(true);
    const emp = await principalFor("yamada");
    expect(emp.permissions.has("security.risk.read")).toBe(false);
    expect(emp.permissions.has("attendance.self.punch")).toBe(true);
  });
  it("is idempotent", async () => {
    const { seedDatabase } = await import("@platform/database");
    await expect(seedDatabase(t.db, { demo: true })).resolves.toBeUndefined();
  });
});

describe("punch flow (§14-§26)", () => {
  let firstRequestId: string;

  it("clock in inside the geofence: employee only sees the plain result", async () => {
    const p = await principalFor("yamada");
    const input = punch("clock_in", { ...HIMEJI, accuracyMeters: 12 });
    firstRequestId = input.requestId;
    const res = await recordPunch(t.db, p, input, meta);
    expect(res.ok).toBe(true);
    expect(res.message).toBe("出勤しました");
    expect(res.locationName).toBe("姫路本院");
    expect(res.serverTime).toBeInstanceOf(Date);
    expect(JSON.stringify(res)).not.toMatch(/risk|score|level|mock|integrity/i);

    const state = await getPunchState(t.db, p.employeeId!);
    expect(state.clockedIn).toBe(true);

    // new device auto-registered as pending -> +15 (UNAPPROVED_DEVICE) -> still NORMAL
    const [ra] = await t.db.select().from(riskAssessments);
    expect(ra?.level).toBe("NORMAL");
    expect(ra?.reasons.map((r) => r.code)).toEqual(["UNAPPROVED_DEVICE"]);
    const devs = await t.db.select().from(devices);
    expect(devs).toHaveLength(1);
    expect(devs[0]?.approvalStatus).toBe("pending");
    expect(await t.db.select().from(securityEvents)).toHaveLength(0);
  });

  it("rejects a replayed request id (§48) and a second clock-in (§49)", async () => {
    const p = await principalFor("yamada");
    await expect(recordPunch(t.db, p, punch("clock_in", HIMEJI, { requestId: firstRequestId }), meta)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(recordPunch(t.db, p, punch("clock_in", HIMEJI), meta)).rejects.toMatchObject({ details: { code: "ALREADY_CLOCKED_IN" } });
  });

  it("rejects a stale client timestamp (replayed payload)", async () => {
    const p = await principalFor("yamada");
    const stale = new Date(Date.now() - 3600_000).toISOString();
    await expect(recordPunch(t.db, p, punch("clock_out", HIMEJI, { clientTime: stale }), meta)).rejects.toMatchObject({ details: { code: "STALE_REQUEST" } });
  });

  it("rejects a malformed request id", async () => {
    const p = await principalFor("yamada");
    await expect(recordPunch(t.db, p, punch("clock_out", HIMEJI, { requestId: "not-a-uuid" }), meta)).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("serialises concurrent double submits (button mashing)", async () => {
    const p = await principalFor("sato");
    const results = await Promise.allSettled([
      recordPunch(t.db, p, punch("clock_in", HIMEJI, { device: { deviceKey: "dev-sato" } }), meta),
      recordPunch(t.db, p, punch("clock_in", HIMEJI, { device: { deviceKey: "dev-sato" } }), meta),
      recordPunch(t.db, p, punch("clock_in", HIMEJI, { device: { deviceKey: "dev-sato" } }), meta),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const open = await t.db.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, p.employeeId!));
    expect(open.filter((r) => r.status === "open")).toHaveLength(1);
  });

  it("clock out from Osaka one minute later -> HIGH_RISK impossible travel, punch still accepted (§26)", async () => {
    const p = await principalFor("yamada");
    const res = await recordPunch(t.db, p, punch("clock_out", { ...OSAKA, accuracyMeters: 30 }), meta);
    expect(res.message).toBe("退勤しました");
    const state = await getPunchState(t.db, p.employeeId!);
    expect(state.clockedIn).toBe(false);
    expect(state.last?.record.clockOutAt).toBeInstanceOf(Date);

    const ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!)).orderBy(riskAssessments.createdAt);
    const last = ras[ras.length - 1]!;
    expect(last.level).toBe("HIGH_RISK");
    const codes = last.reasons.map((r) => r.code);
    expect(codes).toContain("IMPOSSIBLE_TRAVEL");
    expect(codes).toContain("FAR_OUTSIDE_LOCATION");

    const events = await listSecurityEvents(t.db, { status: "open" });
    expect(events).toHaveLength(1);
    expect(events[0]?.event.type).toBe("IMPOSSIBLE_TRAVEL");
    expect(events[0]?.event.severity).toBe("high");

    // Attendance itself is untouched: no auto absence / deletion
    const records = await listRecords(t.db, { employeeId: p.employeeId!, from: "2000-01-01", to: "2100-01-01" });
    expect(records).toHaveLength(1);
    expect(records[0]?.record.status).toBe("closed");
  });

  it("missing GPS is recorded and scored, not rejected", async () => {
    const p = await principalFor("sato");
    await recordPunch(t.db, p, punch("clock_out", null, { device: { deviceKey: "dev-sato" } }), meta);
    const ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!)).orderBy(riskAssessments.createdAt);
    expect(ras[ras.length - 1]?.reasons.map((r) => r.code)).toContain("GPS_MISSING");
  });

  it("head office dashboard counts today's punches (§24) and detail viewing is audited (§34)", async () => {
    const dayStart = new Date(Date.now() - 12 * 3600_000);
    const dayEnd = new Date(Date.now() + 12 * 3600_000);
    const summary = await dashboardSummary(t.db, dayStart, dayEnd);
    expect(summary.total).toBe(4);
    expect(summary.HIGH_RISK).toBe(1);
    expect(summary.REVIEW).toBe(1);
    expect(summary.openEvents).toBe(2);

    const hq = await principalFor("takahashi");
    const ev = (await listSecurityEvents(t.db, { status: "open" })).find((e) => e.event.type === "IMPOSSIBLE_TRAVEL");
    const detail = await getSecurityEventDetail(t.db, ev!.event.id, { userId: hq.userId, ...meta });
    expect(detail.employee?.name).toBe("山田 花子");
    expect(detail.locationCheck?.impossibleTravel).toBe(true);
    expect(detail.locationCheck?.speedKmh).toBeGreaterThan(1000);
    expect(detail.history.length).toBeGreaterThanOrEqual(2);

    const viewed = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "security.gps_viewed"));
    expect(viewed).toHaveLength(1);
    expect(viewed[0]?.actorUserId).toBe(hq.userId);

    const reviewed = await reviewSecurityEvent(t.db, ev!.event.id, "reviewed", "本人に確認済み", { userId: hq.userId, ...meta });
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.reviewedByUserId).toBe(hq.userId);
  });
});

describe("correction requests & approval (§36)", () => {
  it("creates a new version and keeps the original", async () => {
    const yamada = await principalFor("yamada");
    const [rec] = await t.db.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, yamada.employeeId!));
    const newIn = new Date(rec!.clockInAt!.getTime() - 30 * 60_000);
    const req = await createCorrectionRequest(
      t.db,
      yamada,
      { type: "correct_time", recordId: rec!.id, workDate: rec!.workDate, requestedClockInAt: newIn, reason: "打刻忘れ" },
      meta,
    );
    expect(req.status).toBe("pending");

    // second pending request on the same record is refused
    await expect(
      createCorrectionRequest(t.db, yamada, { type: "correct_time", recordId: rec!.id, workDate: rec!.workDate, requestedClockInAt: newIn, reason: "again" }, meta),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // self approval is forbidden, employee has no approve permission anyway
    await expect(decideCorrectionRequest(t.db, yamada, req.id, "approved", "", meta)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const suzuki = await principalFor("suzuki"); // manager in the same organization
    const pending = await listCorrectionRequests(t.db, { status: "pending" });
    expect(pending.some((r) => r.request.id === req.id)).toBe(true);
    const approval = await decideCorrectionRequest(t.db, suzuki, req.id, "approved", "確認しました", meta);
    expect(approval.decision).toBe("approved");
    expect(approval.originalRecordSnapshot).toMatchObject({ id: rec!.id });

    const [original] = await t.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, rec!.id));
    expect(original?.status).toBe("superseded");
    expect(original?.clockInAt?.getTime()).toBe(rec!.clockInAt!.getTime()); // untouched
    const [next] = await t.db.select().from(attendanceRecords).where(eq(attendanceRecords.id, approval.newRecordId!));
    expect(next?.version).toBe(2);
    expect(next?.supersedesRecordId).toBe(rec!.id);
    expect(next?.clockInAt?.getTime()).toBe(newIn.getTime());
    expect(next?.clockOutAt?.getTime()).toBe(rec!.clockOutAt!.getTime());

    // cannot decide twice
    await expect(decideCorrectionRequest(t.db, suzuki, req.id, "rejected", "", meta)).rejects.toMatchObject({ code: "CONFLICT" });
    const withApprovals = await getRequestWithApprovals(t.db, req.id);
    expect(withApprovals.approvals).toHaveLength(1);
  });

  it("exports CSV with BOM and current versions only", async () => {
    const suzuki = await principalFor("suzuki");
    const csv = await exportRecordsCsv(t.db, { from: "2000-01-01", to: "2100-01-01" }, { userId: suzuki.userId, ...meta });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toContain("勤務日");
    expect(lines.filter((l) => l.includes("E0001"))).toHaveLength(1); // superseded version excluded
    const exported = await t.db.select().from(auditLogs).where(eq(auditLogs.action, "attendance.exported"));
    expect(exported).toHaveLength(1);
  });
});

describe("log protection (§35)", () => {
  // drizzle wraps the PostgreSQL error; the trigger message lives in `cause`.
  const rootMessage = async (p: Promise<unknown>) => {
    try {
      await p;
      return "";
    } catch (e) {
      const err = e as Error & { cause?: Error };
      return `${err.message} ${err.cause?.message ?? ""}`;
    }
  };
  it("audit_logs cannot be updated or deleted", async () => {
    expect(await rootMessage(t.db.execute(sql`update audit_logs set action = 'x' where id = (select min(id) from audit_logs)`))).toMatch(/append-only/);
    expect(await rootMessage(t.db.execute(sql`delete from audit_logs`))).toMatch(/append-only/);
    const [{ n }] = (await t.db.execute(sql`select count(*)::int as n from audit_logs`)) as unknown as { n: number }[];
    expect(n).toBeGreaterThan(5);
  });
  it("attendance_events cannot be altered", async () => {
    expect(await rootMessage(t.db.delete(attendanceEvents))).toMatch(/append-only/);
  });
});
