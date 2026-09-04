import { listLocations, listOrganizations } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { LocationForm } from "./LocationForm";
import { siteCodeAction } from "./actions";
import { siteDisplayPath } from "@/lib/site-display";

export const dynamic = "force-dynamic";
export const metadata = { title: "勤務拠点" };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const p = await requirePermissionPage("core.location.write");
  const { edit } = await searchParams;
  const [rows, orgs] = await Promise.all([listLocations(db()), listOrganizations(db())]);
  const editing = rows.find((r) => r.id === edit) ?? null;
  return (
    <AppShell principal={p} title="勤務拠点">
      <div className="card">
        <h2>{editing ? `編集: ${editing.name}` : "新規拠点"}</h2>
        <LocationForm
          key={editing?.id ?? "new"}
          organizations={orgs.map((o) => ({ id: o.id, name: o.name }))}
          initial={
            editing
              ? {
                  id: editing.id,
                  code: editing.code,
                  name: editing.name,
                  address: editing.address ?? "",
                  latitude: editing.latitude,
                  longitude: editing.longitude,
                  radiusMeters: editing.radiusMeters,
                  validFrom: editing.validFrom ?? "",
                  validTo: editing.validTo ?? "",
                  punchAllowed: editing.punchAllowed,
                  organizationId: editing.organizationId ?? "",
                }
              : null
          }
        />
        <p className="muted small">緯度・経度は地図サービス(OpenStreetMap等)で確認して入力してください。距離判定はサーバ側で行い、外部APIは使用しません。</p>
        <p className="muted small">
          拠点コード(動的QR): 有効化すると「表示画面」の URL が発行されます。職場のタブレットや PC でその画面を開いておくと、60 秒ごとに変わる 6 桁コードと QR が表示され、職員はそれを読み取って打刻します。GPS が不安定な屋内でも在席の証拠になります。「必須」にすると未入力の打刻がリスク加点されます(打刻自体は拒否しません)。
        </p>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>コード</th>
              <th>拠点名</th>
              <th>住所</th>
              <th>緯度</th>
              <th>経度</th>
              <th>許容半径</th>
              <th>有効期間</th>
              <th>打刻</th>
              <th>拠点コード</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.code}</td>
                <td>{r.name}</td>
                <td className="wrap">{r.address ?? ""}</td>
                <td>{r.latitude}</td>
                <td>{r.longitude}</td>
                <td>{r.radiusMeters} m</td>
                <td>
                  {r.validFrom ?? "—"} 〜 {r.validTo ?? "—"}
                </td>
                <td>{r.punchAllowed ? <span className="badge badge-ok">可</span> : <span className="badge badge-muted">不可</span>}</td>
                <td>
                  <form action={siteCodeAction} className="actions">
                    <input type="hidden" name="id" value={r.id} />
                    {r.siteCodeSecret ? (
                      <>
                        <span className={`badge ${r.siteCodeRequired ? "badge-warn" : "badge-ok"}`}>{r.siteCodeRequired ? "必須" : "任意"}</span>
                        <a className="btn btn-sm" href={siteDisplayPath(r.id)} target="_blank" rel="noreferrer">
                          表示画面
                        </a>
                        <button className="btn btn-sm" name="op" value={r.siteCodeRequired ? "optional" : "require"}>
                          {r.siteCodeRequired ? "任意にする" : "必須にする"}
                        </button>
                        <button className="btn btn-sm" name="op" value="disable">
                          無効化
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm" name="op" value="enable">
                        有効化
                      </button>
                    )}
                  </form>
                </td>
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
