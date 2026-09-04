import { balanceSummary, fiscalYearOf, halfDaysToText, listLeaveRequests, listLeaveTypes } from "@platform/leave";
import { formatDateTime, getSetting } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { todayJst } from "@/lib/dates";
import { LeaveForm } from "./LeaveForm";
import { cancelLeaveAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "休暇" };

const STATUS = {
  pending: <span className="badge badge-warn">申請中</span>,
  approved: <span className="badge badge-ok">承認</span>,
  rejected: <span className="badge badge-danger">却下</span>,
  cancelled: <span className="badge badge-muted">取消</span>,
};

export default async function LeavePage() {
  const p = await requirePermissionPage("leave.self.read");
  const { fiscalYearStartMonth } = await getSetting<{ fiscalYearStartMonth: number }>(db(), "attendance.evaluation");
  const fy = fiscalYearOf(todayJst(), fiscalYearStartMonth);
  const [types, balances, requests] = await Promise.all([
    listLeaveTypes(db(), { activeOnly: true }),
    p.employeeId ? balanceSummary(db(), p.employeeId, fy) : [],
    p.employeeId ? listLeaveRequests(db(), { employeeId: p.employeeId }) : [],
  ]);
  return (
    <AppShell principal={p} title="休暇">
      <div className="grid">
        <div className="card">
          <h2>{fy}年度 残日数</h2>
          {balances.length === 0 ? <p className="muted">付与された休暇はありません。</p> : null}
          <dl className="kv">
            {balances.map((b) => (
              <div key={b.balance.id} style={{ display: "contents" }}>
                <dt>{b.typeName}</dt>
                <dd>
                  <strong>{halfDaysToText(b.remainingHalfDays)}</strong> 日 残(付与 {halfDaysToText(b.balance.grantedHalfDays)} / 使用 {halfDaysToText(b.balance.usedHalfDays)}
                  {b.pendingHalfDays ? ` / 申請中 ${halfDaysToText(b.pendingHalfDays)}` : ""})
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="card">
          <h2>休暇申請</h2>
          {p.permissions.has("leave.self.request") ? <LeaveForm types={types.map((t) => ({ id: t.id, name: t.name, allowHalfDay: t.allowHalfDay }))} /> : <p className="muted">申請権限がありません。</p>}
        </div>
      </div>
      <div className="card table-wrap">
        <h2>申請履歴</h2>
        <table>
          <thead>
            <tr>
              <th>申請日時</th>
              <th>種別</th>
              <th>期間</th>
              <th>日数</th>
              <th>理由</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <tr key={r.request.id}>
                <td>{formatDateTime(r.request.createdAt)}</td>
                <td>{r.typeName}</td>
                <td>
                  {r.request.startDate}
                  {r.request.endDate !== r.request.startDate ? ` 〜 ${r.request.endDate}` : ""}
                  {r.request.half ? (r.request.half === "am" ? "(午前)" : "(午後)") : ""}
                </td>
                <td>{halfDaysToText(r.request.halfDays)}</td>
                <td className="wrap">{r.request.reason ?? ""}</td>
                <td>{STATUS[r.request.status]}</td>
                <td>
                  {r.request.status === "pending" || (r.request.status === "approved" && r.request.startDate > todayJst()) ? (
                    <form action={cancelLeaveAction}>
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
