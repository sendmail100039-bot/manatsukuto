import { listEmployees, listLocations } from "@platform/core";
import { listShiftPatterns, listShifts } from "@platform/shift";
import { listLeaveRequests } from "@platform/leave";
import { db } from "@/lib/db";
import { managerScope } from "@/lib/scope";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { addDays, fmtHm, isDate, todayJst, weekStart, weekdayJa } from "@/lib/dates";
import { AssignForm } from "./AssignForm";
import { cancelShiftAction, publishAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "シフト管理" };

export default async function ManagerShiftsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const p = await requirePermissionPage(["shift.manage", "shift.team.read"]);
  const sp = await searchParams;
  const start = weekStart(isDate(sp.week) ? sp.week : todayJst());
  const end = addDays(start, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scope = await managerScope(p);
  const [employeesRows, patterns, locations, shiftRows, leaves] = await Promise.all([
    listEmployees(db(), scope),
    listShiftPatterns(db(), { activeOnly: true }),
    listLocations(db(), { activeOnly: true }),
    listShifts(db(), { from: start, to: end, ...scope }),
    listLeaveRequests(db(), { status: "approved", from: start, to: end, ...scope }),
  ]);
  const byKey = new Map(shiftRows.map((r) => [`${r.shift.employeeId}|${r.shift.workDate}`, r]));
  const leaveFor = (employeeId: string, d: string) => leaves.find((l) => l.request.employeeId === employeeId && l.request.startDate <= d && l.request.endDate >= d);
  const unpublished = shiftRows.filter((r) => r.shift.status === "planned").length;
  const canManage = p.permissions.has("shift.manage");
  return (
    <AppShell principal={p} title="シフト管理">
      <div className="row" style={{ alignItems: "center", marginBottom: "1rem" }}>
        <div className="actions" style={{ flex: "0 0 auto" }}>
          <a className="btn btn-sm" href={`?week=${addDays(start, -7)}`}>
            ← 前週
          </a>
          <a className="btn btn-sm" href={`?week=${todayJst()}`}>
            今週
          </a>
          <a className="btn btn-sm" href={`?week=${addDays(start, 7)}`}>
            翌週 →
          </a>
        </div>
        <strong>
          {start} 〜 {end}
        </strong>
        {canManage ? (
          <form action={publishAction} style={{ flex: "0 0 auto" }}>
            <input type="hidden" name="from" value={start} />
            <input type="hidden" name="to" value={end} />
            <button className="btn btn-accent btn-sm" type="submit" disabled={unpublished === 0}>
              この週を公開する({unpublished} 件 未公開)
            </button>
          </form>
        ) : null}
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>職員</th>
              {days.map((d) => (
                <th key={d} style={{ textAlign: "center" }}>
                  {d.slice(5)}
                  <br />
                  <span className="muted small">{weekdayJa(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employeesRows.map((e) => (
              <tr key={e.employee.id}>
                <td>
                  {e.employee.employeeNumber} {e.employee.name}
                  <div className="muted small">{e.departmentName ?? ""}</div>
                </td>
                {days.map((d) => {
                  const s = byKey.get(`${e.employee.id}|${d}`);
                  const lv = leaveFor(e.employee.id, d);
                  return (
                    <td key={d} style={{ textAlign: "center", verticalAlign: "middle" }}>
                      {lv ? (
                        <span className="badge badge-muted">{lv.typeName}</span>
                      ) : s ? (
                        <div>
                          <span className="badge" style={{ background: s.patternColor ?? "#f2f4f7", color: s.patternColor ? "#fff" : undefined, opacity: s.shift.status === "planned" ? 0.6 : 1 }}>
                            {s.patternName ?? "勤務"}
                          </span>
                          <div className="small">
                            {fmtHm(s.shift.startAt)}-{fmtHm(s.shift.endAt)}
                          </div>
                          {s.shift.status === "planned" ? <div className="muted small">未公開</div> : null}
                          {canManage ? (
                            <form action={cancelShiftAction}>
                              <input type="hidden" name="shiftId" value={s.shift.id} />
                              <button className="btn btn-sm" type="submit" style={{ padding: "0 .4rem", fontSize: ".7rem" }}>
                                取消
                              </button>
                            </form>
                          ) : null}
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <div className="card">
          <h2>シフト登録</h2>
          <AssignForm
            employees={employeesRows.map((e) => ({ id: e.employee.id, label: `${e.employee.employeeNumber} ${e.employee.name}` }))}
            patterns={patterns.map((pt) => ({ id: pt.id, name: pt.name, time: `${pt.startTime}-${pt.endTime}` }))}
            locations={locations.map((l) => ({ id: l.id, name: l.name }))}
            defaultDate={start}
          />
          <p className="muted small">
            パターンは <a href="/manager/shift-patterns">シフトパターン</a> で管理します。同じ職員・日付に再登録すると上書きされます。
          </p>
        </div>
      ) : null}
    </AppShell>
  );
}
