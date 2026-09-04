import { hmacHex } from "@platform/auth";

/** Unguessable per-location key for the unauthenticated site display screen. */
export function siteDisplayKey(locationId: string): string {
  return hmacHex(`site-display:${locationId}`).slice(0, 32);
}

export function siteDisplayPath(locationId: string): string {
  return `/site-display/${locationId}?key=${siteDisplayKey(locationId)}`;
}
