import { NextResponse } from "next/server";
import { revokeSession, isTrustedOrigin } from "@platform/auth";
import { writeAudit } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { clearSessionCookie, getPrincipal } from "@/lib/session";

export async function POST(req: Request) {
  if (!isTrustedOrigin(req.headers)) return new NextResponse("bad origin", { status: 403 });
  const p = await getPrincipal();
  if (p) {
    await revokeSession(db(), p.sessionId);
    await writeAudit(db(), { ...(await requestMeta()), actorUserId: p.userId, action: "auth.logout", targetType: "session", targetId: p.sessionId });
  }
  await clearSessionCookie();
  // Relative Location: never leak the internal hostname behind Caddy / Cloudflare Tunnel.
  return new NextResponse(null, { status: 303, headers: { location: "/login" } });
}
