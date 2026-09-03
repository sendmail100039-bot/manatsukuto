"use client";

import { useActionState, useState } from "react";
import { saveEmployeeAction } from "./actions";

export interface EmployeeFormValues {
  id?: string;
  employeeNumber: string;
  name: string;
  nameKana: string;
  organizationId: string;
  departmentId: string;
  primaryLocationId: string;
  employmentType: string;
  hiredOn: string;
  retiredOn: string;
  status: "active" | "on_leave" | "retired";
}

export function EmployeeForm(props: {
  initial: EmployeeFormValues | null;
  organizations: { id: string; name: string }[];
  departments: { id: string; name: string; organizationId: string }[];
  locations: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveEmployeeAction, undefined);
  const v: EmployeeFormValues = props.initial ?? {
    employeeNumber: "",
    name: "",
    nameKana: "",
    organizationId: props.organizations[0]?.id ?? "",
    departmentId: "",
    primaryLocationId: "",
    employmentType: "full_time",
    hiredOn: "",
    retiredOn: "",
    status: "active",
  };
  const [org, setOrg] = useState(v.organizationId);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <div className="row">
        <label>
          職員番号
          <input name="employeeNumber" defaultValue={v.employeeNumber} required />
        </label>
        <label>
          氏名
          <input name="name" defaultValue={v.name} required />
        </label>
        <label>
          氏名カナ
          <input name="nameKana" defaultValue={v.nameKana} />
        </label>
      </div>
      <div className="row">
        <label>
          所属法人・事業所
          <select name="organizationId" value={org} onChange={(e) => setOrg(e.target.value)} required>
            {props.organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          部署
          <select name="departmentId" defaultValue={v.departmentId}>
            <option value="">—</option>
            {props.departments
              .filter((d) => d.organizationId === org)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          主勤務拠点
          <select name="primaryLocationId" defaultValue={v.primaryLocationId}>
            <option value="">—</option>
            {props.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row">
        <label>
          雇用区分
          <select name="employmentType" defaultValue={v.employmentType}>
            <option value="full_time">常勤</option>
            <option value="part_time">非常勤</option>
            <option value="contract">契約</option>
            <option value="temporary">派遣・臨時</option>
          </select>
        </label>
        <label>
          入職日
          <input name="hiredOn" type="date" defaultValue={v.hiredOn} />
        </label>
        <label>
          退職日
          <input name="retiredOn" type="date" defaultValue={v.retiredOn} />
        </label>
        <label>
          在籍状態
          <select name="status" defaultValue={v.status}>
            <option value="active">在籍</option>
            <option value="on_leave">休職</option>
            <option value="retired">退職</option>
          </select>
        </label>
      </div>
      <div className="actions">
        <button className="btn btn-primary" type="submit" disabled={pending}>
          保存
        </button>
        {v.id ? (
          <a className="btn" href="/admin/employees">
            新規作成に戻る
          </a>
        ) : null}
      </div>
    </form>
  );
}
