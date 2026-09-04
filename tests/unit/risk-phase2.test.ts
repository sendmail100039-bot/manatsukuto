import { describe, expect, it } from "vitest";
import { assessRisk, resolveRiskSettings } from "@platform/security";

const base = {
  gpsMissing: false,
  accuracyMeters: 15,
  withinRange: true,
  overshootMeters: 0,
  deviceRegistered: true,
  deviceApproved: true,
  clientSkewSeconds: 0,
  impossibleTravel: false,
  mockLocation: false,
  integrityFailed: false,
};

describe("Phase 2 risk heuristics", () => {
  it("stale GPS fix is scored", () => {
    const r = assessRisk({ ...base, gpsAgeSeconds: 600 });
    expect(r.reasons.map((x) => x.code)).toEqual(["GPS_STALE"]);
    expect(assessRisk({ ...base, gpsAgeSeconds: 30 }).reasons).toEqual([]);
  });
  it("repeated exact position is scored", () => {
    expect(assessRisk({ ...base, positionRepeated: true }).reasons[0]?.code).toBe("POSITION_REPEATED");
  });
  it("implausibly perfect accuracy is scored", () => {
    expect(assessRisk({ ...base, accuracyMeters: 0 }).reasons[0]?.code).toBe("GPS_ACCURACY_IMPLAUSIBLE");
    expect(assessRisk({ ...base, accuracyMeters: 3 }).reasons).toEqual([]);
  });
  it("site code: missing / invalid add points, verified subtracts but never below 0", () => {
    expect(assessRisk({ ...base, siteCode: "missing" }).score).toBe(30);
    expect(assessRisk({ ...base, siteCode: "invalid" }).score).toBe(40);
    const verified = assessRisk({ ...base, siteCode: "verified" });
    expect(verified.score).toBe(0);
    expect(verified.reasons[0]?.points).toBe(-30);
    // verified site code offsets an outside-geofence punch (GPS jitter at the door)
    expect(assessRisk({ ...base, withinRange: false, overshootMeters: 100, siteCode: "verified" }).score).toBe(0);
    expect(assessRisk({ ...base, withinRange: false, overshootMeters: 100, siteCode: "invalid" }).score).toBe(70);
  });
  it("new weights are configurable and merge over defaults", () => {
    const s = resolveRiskSettings({ weights: { siteCodeVerified: 0 }, thresholds: { gpsStaleSeconds: 10 } });
    expect(assessRisk({ ...base, siteCode: "verified" }, s).reasons).toEqual([]);
    expect(assessRisk({ ...base, gpsAgeSeconds: 20 }, s).reasons[0]?.code).toBe("GPS_STALE");
  });
});
