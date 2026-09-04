import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import qrcode from "qrcode-generator";
import { locations } from "@platform/database";
import { currentSiteCode, SITE_CODE_STEP_SECONDS } from "@platform/security";
import { db } from "@/lib/db";
import { siteDisplayKey } from "@/lib/site-display";
import { SiteDisplayClient } from "./SiteDisplayClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "拠点コード表示" };

/**
 * Unauthenticated kiosk screen for a tablet / PC at the workplace. Access is
 * gated by a per-location HMAC key in the URL (shown to managers on the
 * location page). Shows the rotating 6-digit code and a QR that opens the
 * punch screen with the code pre-filled.
 */
export default async function SiteDisplayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> }) {
  const { id } = await params;
  const { key } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const expected = siteDisplayKey(id);
  if (!key || key.length !== expected.length || !timingSafeEqual(Buffer.from(key), Buffer.from(expected))) notFound();
  const [loc] = await db().select().from(locations).where(eq(locations.id, id));
  if (!loc?.siteCodeSecret || !loc.punchAllowed) notFound();

  const { code, expiresInSeconds } = currentSiteCode(loc.siteCodeSecret);
  const origin = process.env.APP_ORIGIN ?? "";
  const qr = qrcode(0, "M");
  qr.addData(`${origin}/?code=${code}`);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
  return (
    <SiteDisplayClient
      locationName={loc.name}
      code={code}
      expiresInSeconds={expiresInSeconds}
      stepSeconds={SITE_CODE_STEP_SECONDS}
      qrSvg={svg}
    />
  );
}
