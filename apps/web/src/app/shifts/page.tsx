import { listShifts } from "@platform/shift";
import { listLeaveRequests } from "@platform/leave";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { fmtHm, monthRange, todayJst, weekdayJa } from "@/lib/dates";

export const dynamic = "force-dynamic";
export const metadata = { title: "シフト" };

export default async function MyShiftsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const p = await requirePermissionPage("shift.self.read");
  const { month: raw } = await searchParams;
  const month = raw && /^\d{4}-\d{2}$/.test(raw) ? raw : todayJst().slice(0, 7);
  const { from, to } = monthRange(month);
  const rows = p.employeeId ? await listShifts(db(), { from, to, employeeId: p.employeeId, publishedOnly: true }) : [];
  const leaves = p.employeeId ? await listLeaveRequests(db(), { employeeId: p.employeeId, status: "approved", from, to }) : [];
  const byDate = new Map(rows.map((r) => [r.shift.workDate, r]));
  const days: string[] = [];
  for (let d = from; d <= to; d = new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)) days.push(d);
  const today = todayJst();
  return (
    <AppShell principal={p} title="シフト">
      <form className="row" method="get">
        <label>
          月
          <input type="month" name="month" defaultValue={month} />
        </label>
        <button className="btn" type="submit">
          表示
        </button>
      </form>
      <p className="muted small">確定(公開)済みのシフトのみ表示されます。</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>日</th>
              <th>曜</th>
              <th>勤務</th>
              <th>時間</th>
              <th>拠点</th>
              <th>備考</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const s = byDate.get(d);
              const lv = leaves.find((l) => l.request.startDate <= d && l.request.endDate >= d);
              const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
              return (
                <tr key={d} style={{ background: d === today ? "#eff8ff" : dow === 0 ? "#fff5f5" : dow === 6 ? "#f5f8ff" : undefined }}>
                  <td>{d.slice(8)}</td>
                  <td>{weekdayJa(d)}</td>
                  <td>
                    {lv ? (
                      <span className="badge badge-muted">
                        {lv.typeName}
                        {lv.request.half ? (lv.request.half === "am" ? "(午前)" : "(午後)") : ""}
                      </span>
                    ) : s ? (
                      <span className="badge" style={{ background: s.patternColor ?? "#f2f4f7", color: s.patternColor ? "#fff" : undefined }}>
                        {s.patternName ?? "勤務"}
                      </span>
                    ) : (
                      <span className="muted">休</span>
                    )}
                  </td>
                  <td>{s ? `${fmtHm(s.shift.startAt)}〜${fmtHm(s.shift.endAt)}` : ""}</td>
                  <td>{s?.locationName ?? ""}</td>
                  <td className="wrap">{s?.shift.note ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
