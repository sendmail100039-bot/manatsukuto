/**
 * Dynamic site code (Phase 2 "動的QR"): each location can hold a TOTP secret. A
 * display at the site (tablet / PC screen) shows the current 6-digit code and a
 * QR containing it. The employee scans or types the code when punching; the
 * server verifies it against the location's secret. Presence proof is therefore
 * something the employee can only obtain on site.
 */
import { eq } from "drizzle-orm";
import { locations, type DbExecutor } from "@platform/database";
import { decryptSecret, encryptSecret, generateTotpSecret, totpCode } from "@platform/auth";

/** Site codes rotate every 60 seconds; ±1 step tolerated (a code stays valid for ~3 minutes). */
export const SITE_CODE_STEP_SECONDS = 60;

export async function enableSiteCode(db: DbExecutor, locationId: string, required: boolean) {
  const secret = generateTotpSecret();
  const [row] = await db
    .update(locations)
    .set({ siteCodeSecret: encryptSecret(secret), siteCodeRequired: required, updatedAt: new Date() })
    .where(eq(locations.id, locationId))
    .returning();
  return row ?? null;
}

export async function setSiteCodeRequired(db: DbExecutor, locationId: string, required: boolean) {
  const [row] = await db.update(locations).set({ siteCodeRequired: required, updatedAt: new Date() }).where(eq(locations.id, locationId)).returning();
  return row ?? null;
}

export async function disableSiteCode(db: DbExecutor, locationId: string) {
  const [row] = await db
    .update(locations)
    .set({ siteCodeSecret: null, siteCodeRequired: false, updatedAt: new Date() })
    .where(eq(locations.id, locationId))
    .returning();
  return row ?? null;
}

export function currentSiteCode(secretEncrypted: string, at = Date.now()): { code: string; expiresInSeconds: number } {
  const secret = decryptSecret(secretEncrypted);
  const code = totpCode(secret, at, SITE_CODE_STEP_SECONDS);
  const elapsed = Math.floor(at / 1000) % SITE_CODE_STEP_SECONDS;
  return { code, expiresInSeconds: SITE_CODE_STEP_SECONDS - elapsed };
}

export function verifySiteCode(secretEncrypted: string, code: string, at = Date.now()): boolean {
  const normalized = code.replace(/\D/g, "");
  if (normalized.length !== 6) return false;
  const secret = decryptSecret(secretEncrypted);
  return [-1, 0, 1].some((i) => totpCode(secret, at + i * SITE_CODE_STEP_SECONDS * 1000, SITE_CODE_STEP_SECONDS) === normalized);
}
