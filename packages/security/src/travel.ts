import { haversineDistanceMeters, type LatLng } from "./geo";

export interface TravelSample extends LatLng {
  at: Date;
}

export interface ImpossibleTravelResult {
  distanceMeters: number;
  elapsedSeconds: number;
  speedKmh: number;
  impossible: boolean;
}

/**
 * Impossible Travel (§20): compares the current punch with the previous one
 * for the same employee. Travel is flagged when the implied speed exceeds
 * `maxSpeedKmh` and the distance is at least `minDistanceMeters` (to ignore GPS
 * jitter between two nearby points captured seconds apart).
 */
export function evaluateImpossibleTravel(
  previous: TravelSample,
  current: TravelSample,
  options: { maxSpeedKmh: number; minDistanceMeters: number },
): ImpossibleTravelResult {
  const distanceMeters = haversineDistanceMeters(previous, current);
  const elapsedSeconds = Math.max(0, (current.at.getTime() - previous.at.getTime()) / 1000);
  const speedKmh = elapsedSeconds > 0 ? (distanceMeters / 1000) / (elapsedSeconds / 3600) : Number.POSITIVE_INFINITY;
  const impossible = distanceMeters >= options.minDistanceMeters && speedKmh > options.maxSpeedKmh;
  return {
    distanceMeters,
    elapsedSeconds: Math.round(elapsedSeconds),
    speedKmh: Number.isFinite(speedKmh) ? speedKmh : Number.MAX_SAFE_INTEGER,
    impossible,
  };
}
