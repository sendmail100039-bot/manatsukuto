import { NextResponse } from "next/server";
import { getPunchState } from "@platform/attendance";
import { db } from "@/lib/db";
import { apiPrincipal, handleApiError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = await apiPrincipal(req, "attendance.self.read");
  if (p instanceof NextResponse) return p;
  try {
    if (!p.employeeId) return NextResponse.json({ ok: true, clockedIn: false });
    const s = await getPunchState(db(), p.employeeId);
    return NextResponse.json({ ok: true, clockedIn: s.clockedIn, onBreak: s.onBreak, breakStartedAt: s.breakStartedAt, since: s.open?.record.clockInAt ?? null, location: s.open?.locationName ?? null });
  } catch (err) {
    return handleApiError(err);
  }
}
