import { listDepartments, listEmployees, listLocations, listOrganizations } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { EmployeeForm } from "./EmployeeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "職員マスタ" };

export default async function AdminEmployeesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const p = await requirePermissionPage("core.employee.write");
  const { edit } = await searchParams;
  const [rows, orgs, depts, locs] = await Promise.all([listEmployees(db(), { includeRetired: true }), listOrganizations(db()), listDepartments(db()), listLocations(db())]);
  const editing = rows.find((r) => r.employee.id === edit)?.employee ?? null;
  return (
    <AppShell principal={p} title="職員マスタ">
      <div className="card">
        <h2>{editing ? `編集: ${editing.name}` : "新規職員"}</h2>
        <EmployeeForm
          key={editing?.id ?? "new"}
          organizations={orgs.map((o) => ({ id: o.id, name: o.name }))}
          departments={depts.map((d) => ({ id: d.id, name: d.name, organizationId: d.organizationId }))}
          locations={locs.map((l) => ({ id: l.id, name: l.name }))}
          initial={
            editing
              ? {
                  id: editing.id,
                  employeeNumber: editing.employeeNumber,
                  name: editing.name,
                  nameKana: editing.nameKana ?? "",
                  organizationId: editing.organizationId,
                  departmentId: editing.departmentId ?? "",
                  primaryLocationId: editing.primaryLocationId ?? "",
                  employmentType: editing.employmentType,
                  hiredOn: editing.hiredOn ?? "",
                  retiredOn: editing.retiredOn ?? "",
                  status: editing.status,
                }
              : null
          }
        />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>職員番号</th>
              <th>氏名</th>
              <th>所属</th>
              <th>部署</th>
              <th>拠点</th>
              <th>在籍</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employee.id}>
                <td>{r.employee.employeeNumber}</td>
                <td>{r.employee.name}</td>
                <td>{r.organizationName}</td>
                <td>{r.departmentName ?? ""}</td>
                <td>{r.locationName ?? ""}</td>
                <td>{r.employee.status}</td>
                <td>
                  <a className="btn btn-sm" href={`?edit=${r.employee.id}`}>
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
