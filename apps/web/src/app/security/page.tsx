import { dashboardSummary, listSecurityEvents } from "@platform/security";
import { formatDateTime, writeAudit } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Security Dashboard" };

const LEVEL = {
  NORMAL: <span className="badge badge-ok">NORMAL</span>,
  REVIEW: <span className="badge badge-warn">REVIEW</span>,
  HIGH_RISK: <span className="badge badge-danger">HIGH_RISK</span>,
};
const STATUS = {
  open: <span className="badge badge-warn">未確認</span>,
  reviewed: <span className="badge badge-ok">確認済</span>,
  dismissed: <span className="badge badge-muted">問題なし</span>,
  confirmed: <span className="badge badge-danger">不正確定(要対応)</span>,
};

function jstDayRange(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const start = new Date(`${fmt.format(now)}T00:00:00+09:00`);
  return { start, end: new Date(start.getTime() + 86_400_000), label: fmt.format(now) };
}

export default async function SecurityDashboard({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = await requirePermissionPage("security.risk.read");
  const { status } = await searchParams;
  const st = (["open", "reviewed", "dismissed", "confirmed"] as const).find((s) => s === status) ?? "open";
  const day = jstDayRange();
  const [summary, events] = await Promise.all([dashboardSummary(db(), day.start, day.end), listSecurityEvents(db(), { status: st })]);
  await writeAudit(db(), { ...(await requestMeta()), actorUserId: p.userId, action: "security.dashboard_viewed" });
  return (
    <AppShell principal={p} title="Security Dashboard">
      <p className="muted">本日の打刻 ({day.label})。判定はあくまで確認対象の抽出であり、不正の確定・勤怠の自動変更は行いません。</p>
      <div className="grid">
        <div className="card stat">
          <div className="muted">本日の打刻</div>
          <div className="n">{summary.total}</div>
        </div>
        <div className="card stat ok">
          <div className="muted">正常</div>
          <div className="n">{summary.NORMAL}</div>
        </div>
        <div className="card stat warn">
          <div className="muted">要確認</div>
          <div className="n">{summary.REVIEW}</div>
        </div>
        <div className="card stat danger">
          <div className="muted">高リスク</div>
          <div className="n">{summary.HIGH_RISK}</div>
        </div>
      </div>
      <h2 style={{ marginTop: "1rem" }}>Security Events</h2>
      <div className="actions" style={{ marginBottom: ".75rem" }}>
        {(["open", "reviewed", "dismissed", "confirmed"] as const).map((s) => (
          <a key={s} className={`btn btn-sm ${s === st ? "btn-primary" : ""}`} href={`?status=${s}`}>
            {{ open: `未確認 (${summary.openEvents})`, reviewed: "確認済", dismissed: "問題なし", confirmed: "不正確定" }[s]}
          </a>
        ))}
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>発生日時</th>
              <th>職員</th>
              <th>打刻</th>
              <th>種別</th>
              <th>レベル</th>
              <th>スコア</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={8} className="muted">
                  該当するイベントはありません
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.event.id}>
                  <td>{formatDateTime(e.event.createdAt)}</td>
                  <td>
                    {e.employeeNumber} {e.employeeName}
                  </td>
                  <td>{e.attendanceEvent ? (e.attendanceEvent.type === "clock_in" ? "出勤" : "退勤") : "—"}</td>
                  <td>{e.event.type}</td>
                  <td>{e.assessment ? LEVEL[e.assessment.level] : "—"}</td>
                  <td>{e.assessment?.score ?? "—"}</td>
                  <td>{STATUS[e.event.status]}</td>
                  <td>
                    <a className="btn btn-sm" href={`/security/events/${e.event.id}`}>
                      詳細
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
