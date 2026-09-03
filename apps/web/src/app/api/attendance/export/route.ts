import { NextResponse } from "next/server";
import { exportRecordsCsv } from "@platform/attendance";
import { db } from "@/lib/db";
import { apiPrincipal, handleApiError, jsonError } from "@/lib/api";
import { requestMeta } from "@/lib/request";
import { managerScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const p = await apiPrincipal(req, "attendance.export");
  if (p instanceof NextResponse) return p;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return jsonError(400, "VALIDATION", "期間の指定が不正です");
  try {
    const scope = await managerScope(p);
    const csv = await exportRecordsCsv(
      db(),
      { from, to, departmentId: url.searchParams.get("departmentId") || undefined, ...scope },
      { userId: p.userId, ...(await requestMeta()) },
    );
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="attendance_${from}_${to}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
