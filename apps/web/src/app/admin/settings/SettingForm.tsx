"use client";

import { useActionState } from "react";
import { saveSettingAction } from "./actions";

export function SettingForm({ settingKey, value }: { settingKey: string; value: string }) {
  const [state, action, pending] = useActionState(saveSettingAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <input type="hidden" name="key" value={settingKey} />
      <textarea name="value" rows={Math.min(24, value.split("\n").length + 1)} defaultValue={value} style={{ fontFamily: "ui-monospace, monospace", fontSize: ".85rem" }} />
      <div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={pending}>
          保存
        </button>
      </div>
    </form>
  );
}
