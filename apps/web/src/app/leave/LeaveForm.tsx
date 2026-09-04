"use client";

import { useActionState, useState } from "react";
import { createLeaveAction } from "./actions";

export function LeaveForm({ types }: { types: { id: string; name: string; allowHalfDay: boolean }[] }) {
  const [state, action, pending] = useActionState(createLeaveAction, undefined);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [half, setHalf] = useState("");
  const type = types.find((t) => t.id === typeId);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <div className="row">
        <label>
          種別
          <select name="leaveTypeId" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          区分
          <select name="half" value={half} onChange={(e) => setHalf(e.target.value)} disabled={!type?.allowHalfDay}>
            <option value="">終日</option>
            <option value="am">午前半休</option>
            <option value="pm">午後半休</option>
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          開始日
          <input type="date" name="startDate" required />
        </label>
        <label>
          終了日(半休は開始日のみ)
          <input type="date" name="endDate" disabled={!!half} />
        </label>
      </div>
      <label>
        理由(任意)
        <input name="reason" maxLength={200} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        申請する
      </button>
    </form>
  );
}
