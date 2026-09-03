import { listCorrectionRequests } from "@platform/attendance";
import { formatDateTime } from "@platform/core";
import { db } from "@/lib/db";
import { managerScope } from "@/lib/scope";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DecisionForm } from "./DecisionForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "修正申請の承認" };

const TYPE_LABEL = { correct_time: "時刻修正", add_missing: "打刻追加", cancel_record: "記録取消" } as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = await requirePermissionPage("attendance.request.approve");
  const { status } = await searchParams;
  const st = (["pending", "approved", "rejected", "cancelled"] as const).find((s) => s === status) ?? "pending";
  const rows = await listCorrectionRequests(db(), { status: st, ...(await managerScope(p)) });
  return (
    <AppShell principal={p} title="修正申請の承認">
      <div className="actions" style={{ marginBottom: "1rem" }}>
        {(["pending", "approved", "rejected", "cancelled"] as const).map((s) => (
          <a key={s} className={`btn btn-sm ${s === st ? "btn-primary" : ""}`} href={`?status=${s}`}>
            {{ pending: "申請中", approved: "承認済", rejected: "却下", cancelled: "取消" }[s]}
          </a>
        ))}
      </div>
      {rows.length === 0 ? <p className="muted">該当する申請はありません。</p> : null}
      {rows.map((r) => (
        <div className="card" key={r.request.id}>
          <div className="grid">
            <dl className="kv">
              <dt>職員</dt>
              <dd>
                {r.employeeNumber} {r.employeeName}
              </dd>
              <dt>種別</dt>
              <dd>{TYPE_LABEL[r.request.type]}</dd>
              <dt>勤務日</dt>
              <dd>{r.request.workDate}</dd>
              <dt>申請日時</dt>
              <dd>{formatDateTime(r.request.createdAt)}</dd>
              <dt>理由</dt>
              <dd>{r.request.reason}</dd>
            </dl>
            <dl className="kv">
              <dt>現在の出勤</dt>
              <dd>{formatDateTime(r.record?.clockInAt) || "—"}</dd>
              <dt>現在の退勤</dt>
              <dd>{formatDateTime(r.record?.clockOutAt) || "—"}</dd>
              <dt>修正後 出勤</dt>
              <dd>
                <strong>{formatDateTime(r.request.requestedClockInAt) || "—"}</strong>
              </dd>
              <dt>修正後 退勤</dt>
              <dd>
                <strong>{formatDateTime(r.request.requestedClockOutAt) || "—"}</strong>
              </dd>
            </dl>
          </div>
          {st === "pending" ? <DecisionForm requestId={r.request.id} /> : null}
        </div>
      ))}
    </AppShell>
  );
}
