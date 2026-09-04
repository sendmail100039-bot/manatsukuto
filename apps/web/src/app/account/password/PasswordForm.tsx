"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <label>
        現在のパスワード
        <input name="current" type="password" autoComplete="current-password" required />
      </label>
      <label>
        新しいパスワード(10文字以上、英字と数字を含む)
        <input name="next" type="password" autoComplete="new-password" required minLength={10} />
      </label>
      <label>
        新しいパスワード(確認)
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        変更する
      </button>
    </form>
  );
}
