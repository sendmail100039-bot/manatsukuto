import { listDepartments, listOrganizations } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { DepartmentForm, OrganizationForm } from "./Forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "組織・部署" };

export default async function OrganizationsPage() {
  const p = await requirePermissionPage("core.organization.write");
  const [orgs, depts] = await Promise.all([listOrganizations(db()), listDepartments(db())]);
  const orgOptions = orgs.map((o) => ({ id: o.id, name: o.name }));
  return (
    <AppShell principal={p} title="組織・部署">
      <div className="grid">
        <div className="card">
          <h2>法人・事業所</h2>
          <OrganizationForm organizations={orgOptions} />
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>コード</th>
                  <th>名称</th>
                  <th>種別</th>
                  <th>親</th>
                  <th>有効</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td>{o.code}</td>
                    <td>{o.name}</td>
                    <td>{o.kind === "office" ? "事業所" : "法人"}</td>
                    <td>{orgs.find((x) => x.id === o.parentId)?.name ?? "—"}</td>
                    <td>{o.active ? "○" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>部署</h2>
          <DepartmentForm organizations={orgOptions} departments={depts.map((d) => ({ id: d.id, name: d.name, organizationId: d.organizationId }))} />
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table>
              <thead>
                <tr>
                  <th>組織</th>
                  <th>コード</th>
                  <th>名称</th>
                  <th>親部署</th>
                  <th>有効</th>
                </tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id}>
                    <td>{orgs.find((o) => o.id === d.organizationId)?.name ?? ""}</td>
                    <td>{d.code}</td>
                    <td>{d.name}</td>
                    <td>{depts.find((x) => x.id === d.parentId)?.name ?? "—"}</td>
                    <td>{d.active ? "○" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
