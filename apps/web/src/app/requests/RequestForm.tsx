"use client";

import { useActionState, useState } from "react";
import { createRequestAction } from "./actions";

export function RequestForm({ record }: { record: { id: string; workDate: string; clockIn: string; clockOut: string } | null }) {
  const [state, action, pending] = useActionState(createRequestAction, undefined);
  const [type, setType] = useState<"correct_time" | "add_missing" | "cancel_record">(record ? "correct_time" : "add_missing");
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {record ? <input type="hidden" name="recordId" value={record.id} /> : null}
      <div className="row">
        <label>
          種別
          <select name="type" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            {record ? <option value="correct_time">時刻修正</option> : null}
            {record ? <option value="cancel_record">記録取消</option> : null}
            {!record ? <option value="add_missing">打刻追加(打刻忘れ)</option> : null}
          </select>
        </label>
        <label>
          勤務日
          <input type="date" name="workDate" defaultValue={record?.workDate ?? ""} required readOnly={!!record} />
        </label>
      </div>
      {type !== "cancel_record" ? (
        <div className="row">
          <label>
            修正後の出勤
            <input type="datetime-local" name="clockIn" defaultValue={record?.clockIn ?? ""} />
          </label>
          <label>
            修正後の退勤
            <input type="datetime-local" name="clockOut" defaultValue={record?.clockOut ?? ""} />
          </label>
        </div>
      ) : null}
      <label>
        理由
        <textarea name="reason" rows={3} required minLength={2} placeholder="例: 端末の不具合で退勤打刻ができなかった" />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        申請する
      </button>
    </form>
  );
}
