import { listEmployees } from "@platform/core";
import { db } from "@/lib/db";
import { managerScope } from "@/lib/scope";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "職員一覧" };

const STATUS = { active: "在籍", on_leave: "休職", retired: "退職" } as const;

export default async function EmployeesPage() {
  const p = await requirePermissionPage("core.employee.read");
  const rows = await listEmployees(db(), { ...(await managerScope(p)), includeRetired: true });
  const canEdit = p.permissions.has("core.employee.write");
  return (
    <AppShell principal={p} title="職員一覧">
      {canEdit ? (
        <p>
          <a className="btn btn-sm" href="/admin/employees">
            職員の登録・編集
          </a>
        </p>
      ) : null}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>職員番号</th>
              <th>氏名</th>
              <th>カナ</th>
              <th>所属</th>
              <th>部署</th>
              <th>主勤務拠点</th>
              <th>雇用区分</th>
              <th>入職日</th>
              <th>在籍</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td>{r.employee.employeeNumber}</td>
                <td>{r.employee.name}</td>
                <td>{r.employee.nameKana ?? ""}</td>
                <td>{r.organizationName ?? ""}</td>
                <td>{r.departmentName ?? ""}</td>
                <td>{r.locationName ?? ""}</td>
                <td>{r.employee.employmentType}</td>
                <td>{r.employee.hiredOn ?? ""}</td>
                <td>{STATUS[r.employee.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
