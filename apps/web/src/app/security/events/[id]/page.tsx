import { notFound } from "next/navigation";
import { getSecurityEventDetail } from "@platform/security";
import { NotFoundError, formatDateTime } from "@platform/core";
import { db } from "@/lib/db";
import { requestMeta } from "@/lib/request";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "セキュリティ詳細" };

export default async function SecurityEventPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requirePermissionPage(["security.event.read", "security.risk.read"]);
  const { id } = await params;
  let d: Awaited<ReturnType<typeof getSecurityEventDetail>>;
  try {
    d = await getSecurityEventDetail(db(), id, { userId: p.userId, ...(await requestMeta()) });
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const canGps = p.permissions.has("security.location.read");
  const canDevice = p.permissions.has("security.device.read");
  const ev = d.attendanceEvent;
  return (
    <AppShell principal={p} title="セキュリティ詳細">
      <p>
        <a href="/security">← ダッシュボードへ戻る</a>
      </p>
      <div className="grid">
        <div className="card">
          <h2>打刻</h2>
          <dl className="kv">
            <dt>職員</dt>
            <dd>
              {d.employee?.employeeNumber} {d.employee?.name}
            </dd>
            <dt>種別</dt>
            <dd>{ev ? (ev.type === "clock_in" ? "出勤" : "退勤") : "—"}</dd>
            <dt>打刻時刻(サーバ)</dt>
            <dd>{formatDateTime(ev?.serverTime)}</dd>
            <dt>端末時刻</dt>
            <dd>
              {formatDateTime(ev?.clientTime)} {ev?.clientSkewSeconds != null ? `(ずれ ${ev.clientSkewSeconds}秒)` : ""}
            </dd>
            <dt>勤務拠点</dt>
            <dd>{d.location?.name ?? "—"}</dd>
            <dt>IP</dt>
            <dd>{ev?.ipAddress ?? "—"}</dd>
          </dl>
        </div>
        <div className="card">
          <h2>リスク判定</h2>
          <dl className="kv">
            <dt>Risk Score</dt>
            <dd>
              <strong>{d.assessment?.score ?? "—"}</strong> / {d.assessment?.level ?? "—"}
            </dd>
            <dt>イベント</dt>
            <dd>
              {d.event.type} ({d.event.severity})
            </dd>
            <dt>状態</dt>
            <dd>{d.event.status}</dd>
          </dl>
          <h3 style={{ marginTop: ".75rem", fontSize: "1rem" }}>判定理由</h3>
          <ul>
            {(d.assessment?.reasons ?? []).map((r, i) => (
              <li key={i}>
                <code>{r.code}</code> +{r.points} {r.detail ? `— ${r.detail}` : ""}
              </li>
            ))}
            {!d.assessment?.reasons.length ? <li className="muted">なし</li> : null}
          </ul>
        </div>
        {canGps ? (
          <div className="card">
            <h2>GPS</h2>
            <dl className="kv">
              <dt>緯度 / 経度</dt>
              <dd>
                {d.locationCheck?.latitude ?? "—"} / {d.locationCheck?.longitude ?? "—"}
              </dd>
              <dt>GPS精度</dt>
              <dd>{d.locationCheck?.accuracyMeters != null ? `${Math.round(d.locationCheck.accuracyMeters)} m` : "—"}</dd>
              <dt>拠点からの距離</dt>
              <dd>
                {d.locationCheck?.distanceMeters != null ? `${Math.round(d.locationCheck.distanceMeters)} m` : "—"}
                {d.locationCheck?.radiusMeters != null ? ` (許容 ${d.locationCheck.radiusMeters} m)` : ""}
              </dd>
              <dt>範囲内</dt>
              <dd>{d.locationCheck?.withinRange == null ? "—" : d.locationCheck.withinRange ? "はい" : "いいえ"}</dd>
              <dt>Impossible Travel</dt>
              <dd>
                {d.locationCheck?.impossibleTravel ? "検出" : "—"}
                {d.locationCheck?.speedKmh != null && d.locationCheck.previousDistanceMeters != null
                  ? ` (前回打刻から ${(d.locationCheck.previousDistanceMeters / 1000).toFixed(1)} km / ${d.locationCheck.elapsedSeconds}秒 ≒ ${Math.round(d.locationCheck.speedKmh)} km/h)`
                  : ""}
              </dd>
              <dt>Mock Location</dt>
              <dd>{d.deviceCheck?.mockLocation == null ? "不明 (Phase 2)" : d.deviceCheck.mockLocation ? "検出" : "なし"}</dd>
            </dl>
            {d.locationCheck?.latitude != null ? (
              <p className="small">
                <a href={`https://www.openstreetmap.org/?mlat=${d.locationCheck.latitude}&mlon=${d.locationCheck.longitude}#map=16/${d.locationCheck.latitude}/${d.locationCheck.longitude}`} target="_blank" rel="noreferrer">
                  地図で確認 (OpenStreetMap)
                </a>
              </p>
            ) : null}
          </div>
        ) : null}
        {canDevice ? (
          <div className="card">
            <h2>端末</h2>
            <dl className="kv">
              <dt>登録</dt>
              <dd>{d.deviceCheck?.registered ? "登録済" : "未登録"}</dd>
              <dt>承認</dt>
              <dd>{d.device?.approvalStatus ?? "—"}</dd>
              <dt>初回利用</dt>
              <dd>{d.deviceCheck?.newDevice ? "この打刻で初回" : formatDateTime(d.device?.firstSeenAt)}</dd>
              <dt>OS</dt>
              <dd>
                {d.device?.os ?? "—"} {d.device?.osVersion ?? ""}
              </dd>
              <dt>アプリ</dt>
              <dd>{d.device?.appVersion ?? "—"}</dd>
              <dt>User-Agent</dt>
              <dd className="small" style={{ wordBreak: "break-all" }}>
                {ev?.userAgent ?? "—"}
              </dd>
            </dl>
          </div>
        ) : null}
      </div>
      <div className="card">
        <h2>過去のリスク履歴</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>打刻</th>
                <th>レベル</th>
                <th>スコア</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              {d.history.map((h) => (
                <tr key={h.assessment.id}>
                  <td>{formatDateTime(h.serverTime)}</td>
                  <td>{h.type === "clock_in" ? "出勤" : "退勤"}</td>
                  <td>{h.assessment.level}</td>
                  <td>{h.assessment.score}</td>
                  <td className="wrap">{h.assessment.reasons.map((r) => r.code).join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card">
        <h2>確認・判定</h2>
        {d.event.reviewedAt ? (
          <p className="muted">
            {formatDateTime(d.event.reviewedAt)} に {d.reviewer?.loginId ?? "—"} が確認: {d.event.reviewNote || "(メモなし)"}
          </p>
        ) : null}
        {p.permissions.has("security.review") ? <ReviewForm id={d.event.id} /> : <p className="muted">判定を記録する権限がありません。</p>}
      </div>
    </AppShell>
  );
}
