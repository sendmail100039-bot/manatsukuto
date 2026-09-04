import { describe, expect, it } from "vitest";
import { evaluateImpossibleTravel } from "@platform/security";

const tokyo = { latitude: 35.6812, longitude: 139.7671 };
const osaka = { latitude: 34.7024, longitude: 135.4959 };
const opts = { maxSpeedKmh: 200, minDistanceMeters: 5000 };

describe("evaluateImpossibleTravel (§20)", () => {
  it("flags 07:30 東京 → 07:31 大阪", () => {
    const r = evaluateImpossibleTravel(
      { ...tokyo, at: new Date("2026-09-03T07:30:00+09:00") },
      { ...osaka, at: new Date("2026-09-03T07:31:00+09:00") },
      opts,
    );
    expect(r.impossible).toBe(true);
    expect(r.elapsedSeconds).toBe(60);
    expect(r.speedKmh).toBeGreaterThan(20_000);
  });
  it("does not flag 東京 → 大阪 over 3 hours (shinkansen)", () => {
    const r = evaluateImpossibleTravel(
      { ...tokyo, at: new Date("2026-09-03T07:00:00+09:00") },
      { ...osaka, at: new Date("2026-09-03T10:00:00+09:00") },
      opts,
    );
    expect(r.impossible).toBe(false);
    expect(r.speedKmh).toBeLessThan(200);
  });
  it("ignores GPS jitter below the minimum distance", () => {
    const r = evaluateImpossibleTravel(
      { ...tokyo, at: new Date("2026-09-03T07:00:00+09:00") },
      { latitude: tokyo.latitude + 0.002, longitude: tokyo.longitude, at: new Date("2026-09-03T07:00:01+09:00") },
      opts,
    );
    expect(r.impossible).toBe(false);
  });
  it("treats zero elapsed time with a large distance as impossible", () => {
    const at = new Date();
    const r = evaluateImpossibleTravel({ ...tokyo, at }, { ...osaka, at }, opts);
    expect(r.impossible).toBe(true);
  });
});
