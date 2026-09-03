import { describe, expect, it } from "vitest";
import { assessRisk, levelForScore, resolveRiskSettings, severityForAssessment } from "@platform/security";
import { DEFAULT_RISK_SETTINGS } from "@platform/database";

const base = {
  gpsMissing: false,
  accuracyMeters: 15,
  withinRange: true,
  overshootMeters: 0,
  deviceRegistered: true,
  deviceApproved: true,
  clientSkewSeconds: 2,
  impossibleTravel: false,
  mockLocation: false,
  integrityFailed: false,
};

describe("assessRisk (§21, §22)", () => {
  it("scores a clean punch as NORMAL with 0 points", () => {
    const r = assessRisk(base);
    expect(r.score).toBe(0);
    expect(r.level).toBe("NORMAL");
    expect(r.reasons).toEqual([]);
    expect(severityForAssessment(r)).toBe("info");
  });
  it("poor accuracy alone stays NORMAL (+20)", () => {
    const r = assessRisk({ ...base, accuracyMeters: 500 });
    expect(r.score).toBe(20);
    expect(r.level).toBe("NORMAL");
    expect(r.reasons[0]?.code).toBe("GPS_ACCURACY_POOR");
  });
  it("unregistered device -> REVIEW (+30)", () => {
    const r = assessRisk({ ...base, deviceRegistered: false, deviceApproved: false });
    expect(r.score).toBe(30);
    expect(r.level).toBe("REVIEW");
  });
  it("impossible travel -> HIGH_RISK (+80)", () => {
    const r = assessRisk({ ...base, impossibleTravel: true });
    expect(r.score).toBe(80);
    expect(r.level).toBe("HIGH_RISK");
    expect(severityForAssessment(r)).toBe("high");
  });
  it("mock location -> HIGH_RISK (+100)", () => {
    expect(assessRisk({ ...base, mockLocation: true }).score).toBe(100);
  });
  it("outside vs far outside", () => {
    expect(assessRisk({ ...base, withinRange: false, overshootMeters: 300 }).reasons[0]?.code).toBe("OUTSIDE_LOCATION");
    expect(assessRisk({ ...base, withinRange: false, overshootMeters: 5000 }).reasons[0]?.code).toBe("FAR_OUTSIDE_LOCATION");
  });
  it("missing GPS does not also add accuracy/location points", () => {
    const r = assessRisk({ ...base, gpsMissing: true, accuracyMeters: null, withinRange: null });
    expect(r.reasons.map((x) => x.code)).toEqual(["GPS_MISSING"]);
  });
  it("weights & thresholds are configurable (§21 'values can be changed later')", () => {
    const settings = resolveRiskSettings({ weights: { unregisteredDevice: 90 }, thresholds: { highRisk: 85 } });
    expect(settings.weights.gpsMissing).toBe(DEFAULT_RISK_SETTINGS.weights.gpsMissing);
    const r = assessRisk({ ...base, deviceRegistered: false, deviceApproved: false }, settings);
    expect(r.score).toBe(90);
    expect(r.level).toBe("HIGH_RISK");
  });
  it("levelForScore boundaries", () => {
    const t = DEFAULT_RISK_SETTINGS.thresholds;
    expect(levelForScore(29, t)).toBe("NORMAL");
    expect(levelForScore(30, t)).toBe("REVIEW");
    expect(levelForScore(79, t)).toBe("REVIEW");
    expect(levelForScore(80, t)).toBe("HIGH_RISK");
  });
  it("ignores garbage settings", () => {
    expect(resolveRiskSettings("nope")).toEqual(DEFAULT_RISK_SETTINGS);
  });
});
