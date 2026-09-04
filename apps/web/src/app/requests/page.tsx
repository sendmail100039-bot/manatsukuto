import { eq } from "drizzle-orm";
import { listCorrectionRequests } from "@platform/attendance";
import { formatDateTime, toLocalInputValue } from "@platform/core";
import { attendanceRecords } from "@platform/database";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { RequestForm } from "./RequestForm";
import { cancelRequestAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "打刻修正申請" };

const TYPE_LABEL = { correct_time: "時刻修正", add_missing: "打刻追加", cancel_record: "記録取消" } as const;
const STATUS = {
  pending: <span className="badge badge-warn">申請中</span>,
  approved: <span className="badge badge-ok">承認</span>,
  rejected: <span className="badge badge-danger">却下</span>,
  cancelled: <span className="badge badge-muted">取消</span>,
};

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ recordId?: string }> }) {
  const p = await requirePermissionPage("attendance.self.request");
  const { recordId } = await searchParams;
  const target = recordId && p.employeeId ? (await db().select().from(attendanceRecords).where(eq(attendanceRecords.id, recordId)))[0] : undefined;
  const record = target && target.employeeId === p.employeeId ? target : undefined;
  const rows = p.employeeId ? await listCorrectionRequests(db(), { employeeId: p.employeeId }) : [];
  return (
    <AppShell principal={p} title="打刻修正申請">
      <div className="card">
        <h2>{record ? `記録の修正 (${record.workDate})` : "新規申請"}</h2>
        <RequestForm
          record={
            record
              ? { id: record.id, workDate: record.workDate, clockIn: toLocalInputValue(record.clockInAt), clockOut: toLocalInputValue(record.clockOutAt) }
              : null
          }
        />
      </div>
      <div className="card table-wrap">
        <h2>申請履歴</h2>
        <table>
          <thead>
            <tr>
              <th>申請日時</th>
              <th>種別</th>
              <th>勤務日</th>
              <th>修正後 出勤</th>
              <th>修正後 退勤</th>
              <th>理由</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.request.id}>
                <td>{formatDateTime(r.request.createdAt)}</td>
                <td>{TYPE_LABEL[r.request.type]}</td>
                <td>{r.request.workDate}</td>
                <td>{formatDateTime(r.request.requestedClockInAt) || "—"}</td>
                <td>{formatDateTime(r.request.requestedClockOutAt) || "—"}</td>
                <td className="wrap">{r.request.reason}</td>
                <td>{STATUS[r.request.status]}</td>
                <td>
                  {r.request.status === "pending" ? (
                    <form action={cancelRequestAction}>
                      <input type="hidden" name="requestId" value={r.request.id} />
                      <button className="btn btn-sm" type="submit">
                        取消
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
