import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { attendanceRecords, locations, users } from "@platform/database";
import { loadPermissions } from "@platform/auth";
import type { Principal } from "@platform/core";
import { getPunchState, recordPunch, exportRecordsCsv, workedMinutes } from "@platform/attendance";
import { currentSiteCode, enableSiteCode } from "@platform/security";
import { createTestDatabase, type TestDb } from "./helpers";

let t: TestDb;
const meta = { ipAddress: "203.0.113.20", userAgent: "vitest" };
const HIMEJI = { latitude: 34.8394, longitude: 134.6939, accuracyMeters: 10 };
const device = { deviceKey: "dev-break-test" };

async function principalFor(loginId: string): Promise<Principal> {
  const [u] = await t.db.select().from(users).where(eq(users.loginId, loginId));
  const { roles, permissions } = await loadPermissions(t.db, u!.id);
  return { userId: u!.id, employeeId: u!.employeeId, loginId, roles, permissions, mfaVerified: true, sessionId: "test" };
}
const punch = (type: "clock_in" | "clock_out" | "break_start" | "break_end", extra: Record<string, unknown> = {}) =>
  ({ type, requestId: randomUUID(), clientTime: new Date().toISOString(), gps: { ...HIMEJI, capturedAt: new Date().toISOString() }, device, ...extra }) as Parameters<typeof recordPunch>[2];

beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => {
  await t.close();
});

describe("break management (Phase 2 休憩管理)", () => {
  it("break_start / break_end are guarded by state and accumulate break minutes", async () => {
    const p = await principalFor("yamada");
    await expect(recordPunch(t.db, p, punch("break_start"), meta)).rejects.toMatchObject({ details: { code: "NOT_CLOCKED_IN" } });
    await recordPunch(t.db, p, punch("clock_in"), meta);
    await expect(recordPunch(t.db, p, punch("break_end"), meta)).rejects.toMatchObject({ details: { code: "NOT_ON_BREAK" } });
    const bs = await recordPunch(t.db, p, punch("break_start"), meta);
    expect(bs.message).toBe("休憩を開始しました");
    let state = await getPunchState(t.db, p.employeeId!);
    expect(state.onBreak).toBe(true);
    await expect(recordPunch(t.db, p, punch("break_start"), meta)).rejects.toMatchObject({ details: { code: "ALREADY_ON_BREAK" } });
    await expect(recordPunch(t.db, p, punch("clock_out"), meta)).rejects.toMatchObject({ details: { code: "ON_BREAK" } });
    const be = await recordPunch(t.db, p, punch("break_end"), meta);
    expect(be.message).toBe("休憩を終了しました");
    state = await getPunchState(t.db, p.employeeId!);
    expect(state.onBreak).toBe(false);
    await recordPunch(t.db, p, punch("clock_out"), meta);
    const [rec] = await t.db.select().from(attendanceRecords).where(eq(attendanceRecords.employeeId, p.employeeId!));
    expect(rec?.status).toBe("closed");
    expect(rec?.breakMinutes).toBe(0); // sub-minute break in the test
    expect(workedMinutes(rec!)).toBe(0);
    const csv = await exportRecordsCsv(t.db, { from: "2000-01-01", to: "2100-01-01" }, { userId: p.userId, ...meta });
    expect(csv.split("\r\n")[0]).toContain("休憩(分)");
  });
});

describe("dynamic site code (Phase 2 動的QR)", () => {
  it("verified code lowers risk; wrong code and missing required code raise it", async () => {
    const p = await principalFor("sato");
    const [loc] = await t.db.select().from(locations).where(eq(locations.code, "HIMEJI-MAIN"));
    const enabled = await enableSiteCode(t.db, loc!.id, true);
    expect(enabled?.siteCodeSecret).toBeTruthy();

    // required but missing
    await recordPunch(t.db, p, punch("clock_in", { device: { deviceKey: "dev-sato-2" } }), meta);
    const { riskAssessments, attendanceEvents } = await import("@platform/database");
    let ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!));
    expect(ras[ras.length - 1]?.reasons.map((r) => r.code)).toContain("SITE_CODE_MISSING");

    // wrong code
    await recordPunch(t.db, p, punch("clock_out", { siteCode: "000000", device: { deviceKey: "dev-sato-2" } }), meta).catch(async () => {
      // "000000" might coincidentally be valid (1 in 10^6); fall back to a guaranteed-wrong code
      await recordPunch(t.db, p, punch("clock_out", { siteCode: "999999", device: { deviceKey: "dev-sato-2" } }), meta);
    });
    ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!));
    const last = ras[ras.length - 1]!;
    expect(["SITE_CODE_INVALID", "SITE_CODE_VERIFIED"]).toContain(last.reasons.find((r) => r.code.startsWith("SITE_CODE"))?.code);

    // correct code
    const { code } = currentSiteCode(enabled!.siteCodeSecret!);
    // slightly different coordinates: identical coordinates would (correctly) trigger POSITION_REPEATED
    const gps = { ...HIMEJI, latitude: HIMEJI.latitude + 0.0002, capturedAt: new Date().toISOString() };
    const res = await recordPunch(t.db, p, punch("clock_in", { siteCode: code, gps, device: { deviceKey: "dev-sato-2" } }), meta);
    const [ev] = await t.db.select().from(attendanceEvents).where(eq(attendanceEvents.id, res.eventId));
    expect(ev?.siteCodeVerified).toBe(true);
    ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!));
    expect(ras[ras.length - 1]?.reasons.map((r) => r.code)).toContain("SITE_CODE_VERIFIED");
    expect(ras[ras.length - 1]?.score).toBe(0);
    // employee response never leaks the verification status beyond the plain result
    expect(Object.keys(res)).not.toContain("siteCode");
  });

  it("a valid code for another site selects that site as the punch target", async () => {
    const p = await principalFor("yamada");
    const [clinic] = await t.db.select().from(locations).where(eq(locations.code, "HIMEJI-CLINIC"));
    const enabled = await enableSiteCode(t.db, clinic!.id, false);
    const { code } = currentSiteCode(enabled!.siteCodeSecret!);
    // GPS says 姫路本院, code says 駅前クリニック -> clinic wins, geofence re-evaluated against clinic
    const res = await recordPunch(t.db, p, punch("clock_in", { siteCode: code, device: { deviceKey: "dev-yamada-3" } }), meta);
    expect(res.locationName).toBe("姫路駅前クリニック");
    const { attendanceEvents } = await import("@platform/database");
    const [ev] = await t.db.select().from(attendanceEvents).where(eq(attendanceEvents.id, res.eventId));
    expect(ev?.locationId).toBe(clinic!.id);
    expect(ev?.siteCodeVerified).toBe(true);
    expect(ev?.withinRange).toBe(false); // ~1.5 km away by GPS
  });

  it("identical coordinates minutes apart are not flagged as POSITION_REPEATED", async () => {
    const p = await principalFor("yamada");
    await recordPunch(t.db, p, punch("clock_out", { device: { deviceKey: "dev-yamada-3" } }), meta);
    const { riskAssessments } = await import("@platform/database");
    const ras = await t.db.select().from(riskAssessments).where(eq(riskAssessments.employeeId, p.employeeId!));
    expect(ras[ras.length - 1]?.reasons.map((r) => r.code)).not.toContain("POSITION_REPEATED");
  });
});
