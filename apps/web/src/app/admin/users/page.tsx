import { listEmployees, listUsersWithRoles, formatDateTime } from "@platform/core";
import { ROLES } from "@platform/database";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { UserForm } from "./UserForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "ユーザー管理" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const p = await requirePermissionPage("core.user.admin");
  const { edit } = await searchParams;
  const [rows, employees] = await Promise.all([listUsersWithRoles(db()), listEmployees(db(), { includeRetired: true })]);
  const editing = rows.find((r) => r.user.id === edit) ?? null;
  const employeeOptions = employees.map((e) => ({ id: e.employee.id, label: `${e.employee.employeeNumber} ${e.employee.name}` }));
  const roleOptions = Object.entries(ROLES).map(([code, r]) => ({ code, name: r.name }));
  return (
    <AppShell principal={p} title="ユーザー管理">
      <div className="card">
        <h2>{editing ? `編集: ${editing.user.loginId}` : "新規ユーザー"}</h2>
        <UserForm
          key={editing?.user.id ?? "new"}
          employees={employeeOptions}
          roles={roleOptions}
          initial={
            editing
              ? { id: editing.user.id, loginId: editing.user.loginId, email: editing.user.email ?? "", employeeId: editing.user.employeeId ?? "", status: editing.user.status, mfaRequired: editing.user.mfaRequired, roles: editing.roles }
              : null
          }
        />
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ログインID</th>
              <th>職員</th>
              <th>ロール</th>
              <th>状態</th>
              <th>MFA必須</th>
              <th>最終ログイン</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user.id}>
                <td>{r.user.loginId}</td>
                <td>{r.employeeNumber ? `${r.employeeNumber} ${r.employeeName}` : "—"}</td>
                <td>{r.roles.join(", ") || "—"}</td>
                <td>{r.user.status}</td>
                <td>{r.user.mfaRequired ? "はい" : ""}</td>
                <td>{formatDateTime(r.user.lastLoginAt) || "—"}</td>
                <td>
                  <a className="btn btn-sm" href={`?edit=${r.user.id}`}>
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
