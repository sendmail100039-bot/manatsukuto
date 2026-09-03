import { NextResponse } from "next/server";
import { recordPunch, type PunchInput } from "@platform/attendance";
import { formatDateTime, formatTime } from "@platform/core";
import { db } from "@/lib/db";
import { apiPrincipal, handleApiError, jsonError } from "@/lib/api";
import { requestMeta } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const p = await apiPrincipal(req, "attendance.self.punch");
  if (p instanceof NextResponse) return p;
  let body: PunchInput;
  try {
    body = (await req.json()) as PunchInput;
  } catch {
    return jsonError(400, "BAD_JSON", "リクエスト形式が不正です");
  }
  try {
    const result = await recordPunch(db(), p, body, await requestMeta());
    // §23: only the plain result reaches the employee.
    return NextResponse.json({
      ok: true,
      type: result.type,
      serverTime: result.serverTime.toISOString(),
      displayTime: formatTime(result.serverTime),
      displayDateTime: formatDateTime(result.serverTime),
      workDate: result.workDate,
      message: result.message,
      locationName: result.locationName,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
