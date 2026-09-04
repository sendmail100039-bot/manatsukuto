"use client";

import { useActionState } from "react";
import { decideLeaveAction, grantBalanceAction, saveLeaveTypeAction } from "./actions";

export function DecideForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideLeaveAction, undefined);
  if (state?.ok) return <div className="alert alert-ok">{state.message}</div>;
  return (
    <form action={action} className="row" style={{ marginTop: ".5rem" }}>
      {state?.error ? <div className="alert alert-error" style={{ flexBasis: "100%" }}>{state.error}</div> : null}
      <input type="hidden" name="requestId" value={requestId} />
      <label style={{ flex: "3 1 200px" }}>
        コメント
        <input name="comment" placeholder="任意" />
      </label>
      <div className="actions">
        <button className="btn btn-accent" name="decision" value="approved" type="submit" disabled={pending}>
          承認
        </button>
        <button className="btn btn-danger" name="decision" value="rejected" type="submit" disabled={pending}>
          却下
        </button>
      </div>
    </form>
  );
}

export function GrantForm({ employees, types, fiscalYear }: { employees: { id: string; label: string }[]; types: { id: string; name: string }[]; fiscalYear: number }) {
  const [state, action, pending] = useActionState(grantBalanceAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <label>
        職員(複数選択可)
        <select name="employeeIds" multiple size={Math.min(8, Math.max(3, employees.length))} required>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label>
          種別
          <select name="leaveTypeId" required>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          年度
          <input type="number" name="fiscalYear" defaultValue={fiscalYear} required />
        </label>
        <label>
          付与日数(0.5 単位)
          <input type="number" name="days" step={0.5} min={0} max={100} defaultValue={10} required />
        </label>
      </div>
      <div className="row">
        <label>
          有効開始
          <input type="date" name="validFrom" />
        </label>
        <label>
          失効日
          <input type="date" name="expiresOn" />
        </label>
        <label>
          メモ
          <input name="note" />
        </label>
      </div>
      <p className="muted small">同じ職員・種別・年度に再度付与すると、付与日数が上書きされます(使用日数は保持)。</p>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        付与する
      </button>
    </form>
  );
}

export function LeaveTypeForm({ initial }: { initial: { id: string; code: string; name: string; paid: boolean; requiresBalance: boolean; allowHalfDay: boolean; active: boolean } | null }) {
  const [state, action, pending] = useActionState(saveLeaveTypeAction, undefined);
  const v = initial ?? { code: "", name: "", paid: true, requiresBalance: true, allowHalfDay: true, active: true };
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="row">
        <label>
          コード
          <input name="code" defaultValue={v.code} required />
        </label>
        <label>
          名称
          <input name="name" defaultValue={v.name} required />
        </label>
      </div>
      <div className="row">
        <label className="inline">
          <input type="checkbox" name="paid" defaultChecked={v.paid} /> 有給
        </label>
        <label className="inline">
          <input type="checkbox" name="requiresBalance" defaultChecked={v.requiresBalance} /> 付与日数を消費する
        </label>
        <label className="inline">
          <input type="checkbox" name="allowHalfDay" defaultChecked={v.allowHalfDay} /> 半休可
        </label>
        <label className="inline">
          <input type="checkbox" name="active" defaultChecked={v.active} /> 有効
        </label>
      </div>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          保存
        </button>
        {initial ? (
          <a className="btn" href="/manager/leave?tab=admin">
            新規作成に戻る
          </a>
        ) : null}
      </div>
    </form>
  );
}
