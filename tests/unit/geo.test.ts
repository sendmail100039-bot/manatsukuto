import { describe, expect, it } from "vitest";
import { checkGeofence, haversineDistanceMeters, isValidCoordinate, nearestLocation } from "@platform/security";

const tokyo = { latitude: 35.6812, longitude: 139.7671 }; // 東京駅
const osaka = { latitude: 34.7024, longitude: 135.4959 }; // 大阪駅

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters(tokyo, tokyo)).toBe(0);
  });
  it("computes Tokyo–Osaka ≈ 400 km", () => {
    const d = haversineDistanceMeters(tokyo, osaka);
    expect(d).toBeGreaterThan(395_000);
    expect(d).toBeLessThan(405_000);
  });
  it("is symmetric", () => {
    expect(haversineDistanceMeters(tokyo, osaka)).toBeCloseTo(haversineDistanceMeters(osaka, tokyo), 6);
  });
  it("handles small offsets (~111 m per 0.001° latitude)", () => {
    const d = haversineDistanceMeters(tokyo, { ...tokyo, latitude: tokyo.latitude + 0.001 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });
});

describe("checkGeofence", () => {
  const site = { ...tokyo, radiusMeters: 200 };
  it("is within range at the site itself", () => {
    const r = checkGeofence(tokyo, site);
    expect(r.withinRange).toBe(true);
    expect(r.overshootMeters).toBe(0);
  });
  it("is outside range 1 km away and reports overshoot", () => {
    const r = checkGeofence({ ...tokyo, latitude: tokyo.latitude + 0.009 }, site);
    expect(r.withinRange).toBe(false);
    expect(r.overshootMeters).toBeGreaterThan(700);
  });
  it("does not let a huge accuracy radius cover the site", () => {
    // accuracy is not part of the geofence check by design
    const r = checkGeofence({ ...osaka }, site);
    expect(r.withinRange).toBe(false);
  });
});

describe("nearestLocation", () => {
  it("picks the closest site", () => {
    const sites = [
      { id: "a", ...tokyo, radiusMeters: 100 },
      { id: "b", ...osaka, radiusMeters: 100 },
    ];
    expect(nearestLocation({ latitude: 34.71, longitude: 135.5 }, sites)?.site.id).toBe("b");
    expect(nearestLocation(tokyo, [])).toBeNull();
  });
});

describe("isValidCoordinate", () => {
  it("rejects garbage", () => {
    expect(isValidCoordinate(null)).toBe(false);
    expect(isValidCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: Number.NaN, longitude: 0 })).toBe(false);
    expect(isValidCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
    expect(isValidCoordinate(tokyo)).toBe(true);
  });
});
