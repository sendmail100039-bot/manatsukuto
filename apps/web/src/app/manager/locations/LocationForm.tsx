"use client";

import { useActionState } from "react";
import { saveLocationAction } from "./actions";

export interface LocationFormValues {
  id?: string;
  code: string;
  name: string;
  address: string;
  latitude: number | "";
  longitude: number | "";
  radiusMeters: number;
  validFrom: string;
  validTo: string;
  punchAllowed: boolean;
  organizationId: string;
}

export function LocationForm({ initial, organizations }: { initial: LocationFormValues | null; organizations: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveLocationAction, undefined);
  const v: LocationFormValues = initial ?? { code: "", name: "", address: "", latitude: "", longitude: "", radiusMeters: 200, validFrom: "", validTo: "", punchAllowed: true, organizationId: "" };
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="row">
        <label>
          拠点コード
          <input name="code" defaultValue={v.code} required />
        </label>
        <label>
          拠点名
          <input name="name" defaultValue={v.name} required />
        </label>
        <label>
          所属組織
          <select name="organizationId" defaultValue={v.organizationId}>
            <option value="">—</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        住所
        <input name="address" defaultValue={v.address} />
      </label>
      <div className="row">
        <label>
          緯度
          <input name="latitude" type="number" step="any" defaultValue={v.latitude} required />
        </label>
        <label>
          経度
          <input name="longitude" type="number" step="any" defaultValue={v.longitude} required />
        </label>
        <label>
          GPS許容半径 (m)
          <input name="radiusMeters" type="number" min={10} max={50000} defaultValue={v.radiusMeters} required />
        </label>
      </div>
      <div className="row">
        <label>
          有効期間 開始
          <input name="validFrom" type="date" defaultValue={v.validFrom} />
        </label>
        <label>
          有効期間 終了
          <input name="validTo" type="date" defaultValue={v.validTo} />
        </label>
        <label className="inline">
          <input name="punchAllowed" type="checkbox" defaultChecked={v.punchAllowed} /> 打刻可
        </label>
      </div>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          保存
        </button>
        {v.id ? (
          <a className="btn" href="/manager/locations">
            新規作成に戻る
          </a>
        ) : null}
      </div>
    </form>
  );
}
