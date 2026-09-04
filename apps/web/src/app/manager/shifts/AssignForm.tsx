"use client";

import { useActionState, useState } from "react";
import { assignShiftAction } from "./actions";

export function AssignForm(props: {
  employees: { id: string; label: string }[];
  patterns: { id: string; name: string; time: string }[];
  locations: { id: string; name: string }[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState(assignShiftAction, undefined);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [patternId, setPatternId] = useState(props.patterns[0]?.id ?? "");
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <div className="actions">
        <button type="button" className={`btn btn-sm ${mode === "single" ? "btn-primary" : ""}`} onClick={() => setMode("single")}>
          1日ずつ
        </button>
        <button type="button" className={`btn btn-sm ${mode === "bulk" ? "btn-primary" : ""}`} onClick={() => setMode("bulk")}>
          期間で一括
        </button>
      </div>
      <label>
        職員(複数選択可: Ctrl / ⌘ クリック)
        <select name="employeeIds" multiple size={Math.min(8, Math.max(3, props.employees.length))} required>
          {props.employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          パターン
          <select name="patternId" value={patternId} onChange={(e) => setPatternId(e.target.value)}>
            {mode === "single" ? <option value="">(時刻を直接指定)</option> : null}
            {props.patterns.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name} {pt.time}
              </option>
            ))}
          </select>
        </label>
        <label>
          拠点
          <select name="locationId" defaultValue="">
            <option value="">(職員の主拠点)</option>
            {props.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {mode === "single" ? (
        <div className="row">
          <label>
            日付
            <input type="date" name="from" defaultValue={props.defaultDate} required />
          </label>
          {!patternId ? (
            <>
              <label>
                開始
                <input type="time" name="startTime" />
              </label>
              <label>
                終了
                <input type="time" name="endTime" />
              </label>
            </>
          ) : null}
          <label>
            備考
            <input name="note" />
          </label>
        </div>
      ) : (
        <div className="row">
          <label>
            開始日
            <input type="date" name="from" defaultValue={props.defaultDate} required />
          </label>
          <label>
            終了日
            <input type="date" name="to" required />
          </label>
          <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, flex: "2 1 260px" }}>
            <legend className="muted small">曜日(未選択なら毎日)</legend>
            <div className="row">
              {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => (
                <label className="inline" key={i} style={{ flex: "0 0 auto" }}>
                  <input type="checkbox" name="weekdays" value={i} defaultChecked={i >= 1 && i <= 5} /> {d}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
      <label className="inline">
        <input type="checkbox" name="publish" /> すぐに公開(職員に表示)する
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        登録
      </button>
    </form>
  );
}
