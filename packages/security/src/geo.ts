/**
 * GPS distance & geofence logic. Pure functions - no external map service (§5, §18).
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in meters (haversine). */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidCoordinate(p: Partial<LatLng> | null | undefined): p is LatLng {
  return (
    !!p &&
    typeof p.latitude === "number" &&
    typeof p.longitude === "number" &&
    Number.isFinite(p.latitude) &&
    Number.isFinite(p.longitude) &&
    Math.abs(p.latitude) <= 90 &&
    Math.abs(p.longitude) <= 180
  );
}

export interface GeofenceResult {
  distanceMeters: number;
  radiusMeters: number;
  withinRange: boolean;
  /** distance beyond the radius (0 when inside) */
  overshootMeters: number;
}

/**
 * Geofence check. The GPS accuracy circle is *not* subtracted from the
 * distance: a poor accuracy value is scored separately so that a device
 * reporting a huge accuracy radius cannot "cover" the site.
 */
export function checkGeofence(position: LatLng, site: LatLng & { radiusMeters: number }): GeofenceResult {
  const distanceMeters = haversineDistanceMeters(position, site);
  const withinRange = distanceMeters <= site.radiusMeters;
  return {
    distanceMeters,
    radiusMeters: site.radiusMeters,
    withinRange,
    overshootMeters: withinRange ? 0 : distanceMeters - site.radiusMeters,
  };
}

/** Pick the nearest punch-enabled location; null when none is given. */
export function nearestLocation<T extends LatLng & { radiusMeters: number }>(
  position: LatLng,
  sites: readonly T[],
): { site: T; check: GeofenceResult } | null {
  let best: { site: T; check: GeofenceResult } | null = null;
  for (const site of sites) {
    const check = checkGeofence(position, site);
    if (!best || check.distanceMeters < best.check.distanceMeters) best = { site, check };
  }
  return best;
}
