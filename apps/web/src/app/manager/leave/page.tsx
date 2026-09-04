import { formatDateTime, getSetting, listEmployees } from "@platform/core";
import { fiscalYearOf, halfDaysToText, listBalances, listLeaveRequests, listLeaveTypes } from "@platform/leave";
import { db } from "@/lib/db";
import { managerScope } from "@/lib/scope";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { todayJst } from "@/lib/dates";
import { DecideForm, GrantForm, LeaveTypeForm } from "./Forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "休暇管理" };

const STATUS = {
  pending: <span className="badge badge-warn">申請中</span>,
  approved: <span className="badge badge-ok">承認</span>,
  rejected: <span className="badge badge-danger">却下</span>,
  cancelled: <span className="badge badge-muted">取消</span>,
};

export default async function ManagerLeavePage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; edit?: string }> }) {
  const p = await requirePermissionPage(["leave.approve", "leave.team.read", "leave.admin"]);
  const sp = await searchParams;
  const canAdmin = p.permissions.has("leave.admin");
  const tab = sp.tab === "admin" && canAdmin ? "admin" : sp.tab === "balances" ? "balances" : "requests";
  const st = (["pending", "approved", "rejected", "cancelled"] as const).find((s) => s === sp.status) ?? "pending";
  const scope = await managerScope(p);
  const { fiscalYearStartMonth } = await getSetting<{ fiscalYearStartMonth: number }>(db(), "attendance.evaluation");
  const fy = fiscalYearOf(todayJst(), fiscalYearStartMonth);
  const [requests, balances, types, employeesRows] = await Promise.all([
    listLeaveRequests(db(), { status: st, ...scope }),
    listBalances(db(), { fiscalYear: fy, ...scope }),
    listLeaveTypes(db()),
    listEmployees(db(), scope),
  ]);
  const editingType = types.find((t) => t.id === sp.edit) ?? null;
  return (
    <AppShell principal={p} title="休暇管理">
      <div className="actions" style={{ marginBottom: "1rem" }}>
        <a className={`btn btn-sm ${tab === "requests" ? "btn-primary" : ""}`} href="?tab=requests">
          申請
        </a>
        <a className={`btn btn-sm ${tab === "balances" ? "btn-primary" : ""}`} href="?tab=balances">
          {fy}年度 残日数
        </a>
        {canAdmin ? (
          <a className={`btn btn-sm ${tab === "admin" ? "btn-primary" : ""}`} href="?tab=admin">
            種別・付与
          </a>
        ) : null}
      </div>

      {tab === "requests" ? (
        <>
          <div className="actions" style={{ marginBottom: ".75rem" }}>
            {(["pending", "approved", "rejected", "cancelled"] as const).map((s) => (
              <a key={s} className={`btn btn-sm ${s === st ? "btn-primary" : ""}`} href={`?tab=requests&status=${s}`}>
                {{ pending: "申請中", approved: "承認済", rejected: "却下", cancelled: "取消" }[s]}
              </a>
            ))}
          </div>
          {requests.length === 0 ? <p className="muted">該当する申請はありません。</p> : null}
          {requests.map((r) => (
            <div className="card" key={r.request.id}>
              <dl className="kv">
                <dt>職員</dt>
                <dd>
                  {r.employeeNumber} {r.employeeName} <span className="muted small">{r.departmentName ?? ""}</span>
                </dd>
                <dt>種別</dt>
                <dd>{r.typeName}</dd>
                <dt>期間</dt>
                <dd>
                  {r.request.startDate}
                  {r.request.endDate !== r.request.startDate ? ` 〜 ${r.request.endDate}` : ""}
                  {r.request.half ? (r.request.half === "am" ? "(午前半休)" : "(午後半休)") : ""} / {halfDaysToText(r.request.halfDays)} 日
                </dd>
                <dt>理由</dt>
                <dd>{r.request.reason ?? "—"}</dd>
                <dt>申請日時</dt>
                <dd>
                  {formatDateTime(r.request.createdAt)} {STATUS[r.request.status]}
                </dd>
              </dl>
              {st === "pending" && p.permissions.has("leave.approve") ? <DecideForm requestId={r.request.id} /> : null}
            </div>
          ))}
        </>
      ) : null}

      {tab === "balances" ? (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>職員</th>
                <th>種別</th>
                <th>付与</th>
                <th>使用</th>
                <th>残</th>
                <th>失効日</th>
                <th>メモ</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.balance.id}>
                  <td>
                    {b.employeeNumber} {b.employeeName}
                  </td>
                  <td>{b.typeName}</td>
                  <td>{halfDaysToText(b.balance.grantedHalfDays)}</td>
                  <td>{halfDaysToText(b.balance.usedHalfDays)}</td>
                  <td>
                    <strong>{halfDaysToText(b.balance.grantedHalfDays - b.balance.usedHalfDays)}</strong>
                  </td>
                  <td>{b.balance.expiresOn ?? "—"}</td>
                  <td className="wrap">{b.balance.note ?? ""}</td>
                </tr>
              ))}
              {balances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    付与データがありません
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "admin" ? (
        <div className="grid">
          <div className="card">
            <h2>付与</h2>
            <GrantForm employees={employeesRows.map((e) => ({ id: e.employee.id, label: `${e.employee.employeeNumber} ${e.employee.name}` }))} types={types.filter((t) => t.active && t.requiresBalance).map((t) => ({ id: t.id, name: t.name }))} fiscalYear={fy} />
          </div>
          <div className="card">
            <h2>{editingType ? `種別を編集: ${editingType.name}` : "休暇種別を追加"}</h2>
            <LeaveTypeForm key={editingType?.id ?? "new"} initial={editingType ? { id: editingType.id, code: editingType.code, name: editingType.name, paid: editingType.paid, requiresBalance: editingType.requiresBalance, allowHalfDay: editingType.allowHalfDay, active: editingType.active } : null} />
            <div className="table-wrap" style={{ marginTop: "1rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>コード</th>
                    <th>名称</th>
                    <th>有給</th>
                    <th>消費</th>
                    <th>半休</th>
                    <th>有効</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id}>
                      <td>{t.code}</td>
                      <td>{t.name}</td>
                      <td>{t.paid ? "○" : "—"}</td>
                      <td>{t.requiresBalance ? "○" : "—"}</td>
                      <td>{t.allowHalfDay ? "○" : "—"}</td>
                      <td>{t.active ? "○" : "—"}</td>
                      <td>
                        <a className="btn btn-sm" href={`?tab=admin&edit=${t.id}`}>
                          編集
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
