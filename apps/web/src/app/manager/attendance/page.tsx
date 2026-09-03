import { listRecords } from "@platform/attendance";
import { formatTime, listDepartments, toWorkDate } from "@platform/core";
import { db } from "@/lib/db";
import { managerScope } from "@/lib/scope";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "勤怠一覧" };

export default async function ManagerAttendancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; departmentId?: string }> }) {
  const p = await requirePermissionPage(["attendance.team.read", "attendance.all.read"]);
  const sp = await searchParams;
  const today = toWorkDate(new Date());
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const scope = await managerScope(p);
  const departments = await listDepartments(db(), scope.organizationId);
  const rows = await listRecords(db(), { from, to, departmentId: sp.departmentId || undefined, ...scope });
  const canExport = p.permissions.has("attendance.export");
  const query = new URLSearchParams({ from, to, ...(sp.departmentId ? { departmentId: sp.departmentId } : {}) }).toString();
  return (
    <AppShell principal={p} title="勤怠一覧">
      <form className="row card" method="get">
        <label>
          開始
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          終了
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label>
          部署
          <select name="departmentId" defaultValue={sp.departmentId ?? ""}>
            <option value="">すべて</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button className="btn btn-primary" type="submit">
            表示
          </button>
          {canExport ? (
            <a className="btn" href={`/api/attendance/export?${query}`}>
              CSV出力
            </a>
          ) : null}
        </div>
      </form>
      <div className="card table-wrap">
        <p className="muted small">{rows.length} 件</p>
        <table>
          <thead>
            <tr>
              <th>勤務日</th>
              <th>職員番号</th>
              <th>氏名</th>
              <th>部署</th>
              <th>拠点</th>
              <th>出勤</th>
              <th>退勤</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.record.id}>
                <td>{r.record.workDate}</td>
                <td>{r.employeeNumber}</td>
                <td>{r.employeeName}</td>
                <td>{r.departmentName ?? "—"}</td>
                <td>{r.locationName ?? "—"}</td>
                <td>{formatTime(r.record.clockInAt) || "—"}</td>
                <td>{formatTime(r.record.clockOutAt) || "—"}</td>
                <td>
                  {r.record.status === "open" ? <span className="badge badge-warn">出勤中</span> : <span className="badge badge-ok">完了</span>}
                  {r.record.version > 1 ? <span className="badge badge-muted"> v{r.record.version}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
