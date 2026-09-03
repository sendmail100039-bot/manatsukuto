"use client";

import { useActionState } from "react";
import { saveDepartmentAction, saveOrganizationAction } from "./actions";

export function OrganizationForm({ organizations }: { organizations: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(saveOrganizationAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <div className="row">
        <label>
          コード
          <input name="code" required />
        </label>
        <label>
          名称
          <input name="name" required />
        </label>
      </div>
      <div className="row">
        <label>
          種別
          <select name="kind" defaultValue="office">
            <option value="corporation">法人</option>
            <option value="office">事業所</option>
          </select>
        </label>
        <label>
          親組織
          <select name="parentId" defaultValue="">
            <option value="">(なし)</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" name="active" defaultChecked /> 有効
        </label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        追加
      </button>
    </form>
  );
}

export function DepartmentForm({ organizations, departments }: { organizations: { id: string; name: string }[]; departments: { id: string; name: string; organizationId: string }[] }) {
  const [state, action, pending] = useActionState(saveDepartmentAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <div className="row">
        <label>
          組織
          <select name="organizationId" required defaultValue={organizations[0]?.id ?? ""}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          コード
          <input name="code" required />
        </label>
        <label>
          名称
          <input name="name" required />
        </label>
      </div>
      <div className="row">
        <label>
          親部署
          <select name="parentId" defaultValue="">
            <option value="">(なし)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          <input type="checkbox" name="active" defaultChecked /> 有効
        </label>
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        追加
      </button>
    </form>
  );
}
