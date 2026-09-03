"use client";

import { useActionState } from "react";
import { createUserAction, updateUserAction } from "./actions";

export interface UserFormValues {
  id?: string;
  loginId: string;
  email: string;
  employeeId: string;
  status: "active" | "locked" | "disabled";
  mfaRequired: boolean;
  roles: string[];
}

export function UserForm({ initial, employees, roles }: { initial: UserFormValues | null; employees: { id: string; label: string }[]; roles: { code: string; name: string }[] }) {
  const [state, action, pending] = useActionState(initial ? updateUserAction : createUserAction, undefined);
  const v: UserFormValues = initial ?? { loginId: "", email: "", employeeId: "", status: "active", mfaRequired: false, roles: ["employee"] };
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="row">
        <label>
          ログインID
          <input name="loginId" defaultValue={v.loginId} required readOnly={!!v.id} />
        </label>
        <label>
          メール(任意)
          <input name="email" type="email" defaultValue={v.email} />
        </label>
        <label>
          職員
          <select name="employeeId" defaultValue={v.employeeId}>
            <option value="">(紐づけなし)</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          {v.id ? "パスワード再設定(空欄で変更なし)" : "初期パスワード"}
          <input name="password" type="password" autoComplete="new-password" required={!v.id} minLength={10} />
        </label>
        {v.id ? (
          <label>
            状態
            <select name="status" defaultValue={v.status}>
              <option value="active">有効</option>
              <option value="locked">ロック</option>
              <option value="disabled">無効</option>
            </select>
          </label>
        ) : null}
        <label className="inline">
          <input type="checkbox" name="mfaRequired" defaultChecked={v.mfaRequired} /> MFA必須
        </label>
      </div>
      <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
        <legend className="muted small">ロール</legend>
        <div className="row">
          {roles.map((r) => (
            <label className="inline" key={r.code}>
              <input type="checkbox" name={`role_${r.code}`} defaultChecked={v.roles.includes(r.code)} /> {r.name} <code className="muted">{r.code}</code>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          {v.id ? "更新" : "作成"}
        </button>
        {v.id ? (
          <a className="btn" href="/admin/users">
            新規作成に戻る
          </a>
        ) : null}
      </div>
    </form>
  );
}
