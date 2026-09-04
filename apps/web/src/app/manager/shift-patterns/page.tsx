import { listShiftPatterns } from "@platform/shift";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PatternForm } from "./PatternForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "シフトパターン" };

export default async function ShiftPatternsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const p = await requirePermissionPage("shift.manage");
  const { edit } = await searchParams;
  const rows = await listShiftPatterns(db());
  const editing = rows.find((r) => r.id === edit) ?? null;
  return (
    <AppShell principal={p} title="シフトパターン">
      <div className="card">
        <h2>{editing ? `編集: ${editing.name}` : "新規パターン"}</h2>
        <PatternForm
          key={editing?.id ?? "new"}
          initial={editing ? { id: editing.id, code: editing.code, name: editing.name, startTime: editing.startTime, endTime: editing.endTime, breakMinutes: editing.breakMinutes, color: editing.color ?? "", active: editing.active } : null}
        />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>コード</th>
              <th>名称</th>
              <th>時間</th>
              <th>休憩</th>
              <th>有効</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td>
                <td>
                  <span className="badge" style={{ background: r.color ?? "#f2f4f7", color: r.color ? "#fff" : undefined }}>
                    {r.name}
                  </span>
                </td>
                <td>
                  {r.startTime}〜{r.endTime}
                  {r.endTime <= r.startTime ? "(翌日)" : ""}
                </td>
                <td>{r.breakMinutes} 分</td>
                <td>{r.active ? "○" : "—"}</td>
                <td>
                  <a className="btn btn-sm" href={`?edit=${r.id}`}>
                    編集
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
