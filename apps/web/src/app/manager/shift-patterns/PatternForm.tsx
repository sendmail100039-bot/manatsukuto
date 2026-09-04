"use client";

import { useActionState } from "react";
import { savePatternAction } from "./actions";

export interface PatternValues {
  id?: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  color: string;
  active: boolean;
}

export function PatternForm({ initial }: { initial: PatternValues | null }) {
  const [state, action, pending] = useActionState(savePatternAction, undefined);
  const v: PatternValues = initial ?? { code: "", name: "", startTime: "09:00", endTime: "18:00", breakMinutes: 60, color: "#175cd3", active: true };
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="row">
        <label>
          コード
          <input name="code" defaultValue={v.code} required />
        </label>
        <label>
          名称
          <input name="name" defaultValue={v.name} required />
        </label>
        <label>
          色
          <input name="color" type="color" defaultValue={v.color || "#175cd3"} />
        </label>
      </div>
      <div className="row">
        <label>
          開始
          <input name="startTime" type="time" defaultValue={v.startTime} required />
        </label>
        <label>
          終了(開始より前なら翌日)
          <input name="endTime" type="time" defaultValue={v.endTime} required />
        </label>
        <label>
          休憩(分)
          <input name="breakMinutes" type="number" min={0} max={600} defaultValue={v.breakMinutes} required />
        </label>
        <label className="inline">
          <input type="checkbox" name="active" defaultChecked={v.active} /> 有効
        </label>
      </div>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          保存
        </button>
        {v.id ? (
          <a className="btn" href="/manager/shift-patterns">
            新規作成に戻る
          </a>
        ) : null}
      </div>
    </form>
  );
}
