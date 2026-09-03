import { getPunchState } from "@platform/attendance";
import { formatDateTime } from "@platform/core";
import { db } from "@/lib/db";
import { requireLogin } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PunchPanel } from "@/components/PunchPanel";

export const dynamic = "force-dynamic";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const p = await requireLogin();
  const { denied } = await searchParams;
  const state = p.employeeId ? await getPunchState(db(), p.employeeId) : null;
  return (
    <AppShell principal={p}>
      {denied ? <div className="alert alert-error">その画面を表示する権限がありません。</div> : null}
      {!p.employeeId ? (
        <div className="card">
          <p>このアカウントには職員情報が紐づいていないため、打刻はできません。</p>
        </div>
      ) : (
        <PunchPanel
          initialClockedIn={state!.clockedIn}
          initialSince={state!.open?.record.clockInAt ? formatDateTime(state!.open.record.clockInAt) : null}
          initialLocation={state!.open?.locationName ?? null}
          canPunch={p.permissions.has("attendance.self.punch")}
        />
      )}
      {state?.last && !state.clockedIn ? (
        <div className="card">
          <h2>前回の勤務</h2>
          <dl className="kv">
            <dt>勤務日</dt>
            <dd>{state.last.record.workDate}</dd>
            <dt>出勤</dt>
            <dd>{formatDateTime(state.last.record.clockInAt)}</dd>
            <dt>退勤</dt>
            <dd>{formatDateTime(state.last.record.clockOutAt) || "—"}</dd>
            <dt>拠点</dt>
            <dd>{state.last.locationName ?? "—"}</dd>
          </dl>
        </div>
      ) : null}
    </AppShell>
  );
}
