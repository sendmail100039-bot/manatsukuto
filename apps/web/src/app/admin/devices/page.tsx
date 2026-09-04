import { formatDateTime, listDevices } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { deviceAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "端末管理" };

export default async function DevicesPage() {
  const p = await requirePermissionPage(["core.device.read", "core.device.write"]);
  const rows = await listDevices(db());
  const canWrite = p.permissions.has("core.device.write");
  return (
    <AppShell principal={p} title="端末管理">
      <p className="muted">職員が打刻に使用した端末の一覧です。1人の職員に複数端末を登録できます。未承認端末からの打刻はリスクスコアに加点されます(打刻自体は拒否しません)。</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>職員</th>
              <th>OS</th>
              <th>アプリ</th>
              <th>初回利用</th>
              <th>最終利用</th>
              <th>承認</th>
              <th>状態</th>
              {canWrite ? <th></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.device.id}>
                <td>
                  {r.employeeNumber} {r.employeeName}
                </td>
                <td>
                  {r.device.os ?? "—"} {r.device.osVersion ?? ""}
                </td>
                <td>{r.device.appVersion ?? "—"}</td>
                <td>{formatDateTime(r.device.firstSeenAt)}</td>
                <td>{formatDateTime(r.device.lastSeenAt)}</td>
                <td>
                  {r.device.approvalStatus === "approved" ? <span className="badge badge-ok">承認</span> : r.device.approvalStatus === "rejected" ? <span className="badge badge-danger">拒否</span> : <span className="badge badge-warn">未承認</span>}
                </td>
                <td>{r.device.disabled ? <span className="badge badge-danger">無効</span> : <span className="badge badge-ok">有効</span>}</td>
                {canWrite ? (
                  <td>
                    <form action={deviceAction} className="actions">
                      <input type="hidden" name="id" value={r.device.id} />
                      {r.device.approvalStatus !== "approved" ? (
                        <button className="btn btn-sm" name="op" value="approve">
                          承認
                        </button>
                      ) : null}
                      {r.device.approvalStatus !== "rejected" ? (
                        <button className="btn btn-sm" name="op" value="reject">
                          拒否
                        </button>
                      ) : null}
                      {r.device.disabled ? (
                        <button className="btn btn-sm" name="op" value="enable">
                          有効化
                        </button>
                      ) : (
                        <button className="btn btn-sm" name="op" value="disable">
                          無効化
                        </button>
                      )}
                    </form>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
