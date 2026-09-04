import { listRecords, workedMinutes } from "@platform/attendance";
import { formatTime, toWorkDate } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "勤怠履歴" };

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const p = await requirePermissionPage("attendance.self.read");
  const { month: raw } = await searchParams;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : toWorkDate(new Date()).slice(0, 7);
  const { from, to } = monthRange(month);
  const rows = p.employeeId ? await listRecords(db(), { employeeId: p.employeeId, from, to }) : [];
  return (
    <AppShell principal={p} title="勤怠履歴">
      <form className="row" method="get">
        <label>
          月
          <input type="month" name="month" defaultValue={month} />
        </label>
        <button className="btn" type="submit">
          表示
        </button>
      </form>
      <div className="card table-wrap" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>勤務日</th>
              <th>出勤</th>
              <th>退勤</th>
              <th>休憩</th>
              <th>実働</th>
              <th>拠点</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  記録がありません
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.record.id}>
                  <td>{r.record.workDate}</td>
                  <td>{formatTime(r.record.clockInAt) || "—"}</td>
                  <td>{formatTime(r.record.clockOutAt) || "—"}</td>
                <td>{r.record.breakMinutes ? `${r.record.breakMinutes}分` : "—"}</td>
                <td>{workedMinutes(r.record) == null ? "—" : `${Math.floor(workedMinutes(r.record)! / 60)}:${String(workedMinutes(r.record)! % 60).padStart(2, "0")}`}</td>
                  <td>{r.record.breakMinutes ? `${r.record.breakMinutes}分` : "—"}</td>
                  <td>{workedMinutes(r.record) == null ? "—" : `${Math.floor(workedMinutes(r.record)! / 60)}:${String(workedMinutes(r.record)! % 60).padStart(2, "0")}`}</td>
                  <td>{r.locationName ?? "—"}</td>
                  <td>
                    {r.record.status === "open" ? <span className="badge badge-warn">出勤中</span> : <span className="badge badge-ok">完了</span>}
                    {r.record.version > 1 ? <span className="badge badge-muted"> 修正済 v{r.record.version}</span> : null}
                  </td>
                  <td>
                    <a className="btn btn-sm" href={`/requests?recordId=${r.record.id}`}>
                      修正申請
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
