"use client";

import { useActionState, useEffect, useState } from "react";
import { confirmEnrollmentAction, startEnrollmentAction, verifyAction } from "./actions";

export function MfaVerify() {
  const [state, action, pending] = useActionState(verifyAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      <label>
        認証アプリの6桁コード(またはリカバリーコード)
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        確認
      </button>
    </form>
  );
}

export function MfaEnroll({ account }: { account: string }) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | { error: string } | null>(null);
  const [state, action, pending] = useActionState(confirmEnrollmentAction, undefined);

  useEffect(() => {
    startEnrollmentAction().then(setSetup);
  }, []);

  if (state?.ok && state.recoveryCodes) {
    return (
      <div>
        <div className="alert alert-ok">{state.message}</div>
        <p>リカバリーコード(各1回のみ使用可):</p>
        <pre className="code">{state.recoveryCodes.join("\n")}</pre>
        <a className="btn btn-primary" href="/">
          続ける
        </a>
      </div>
    );
  }
  if (!setup) return <p className="muted">準備中…</p>;
  if ("error" in setup) return <div className="alert alert-error">{setup.error}</div>;
  return (
    <form action={action} className="stack">
      <p>
        認証アプリ(Google Authenticator / Microsoft Authenticator 等)で以下のキーを登録してください。
      </p>
      <dl className="kv">
        <dt>アカウント</dt>
        <dd>{account}</dd>
        <dt>シークレット</dt>
        <dd>
          <code style={{ wordBreak: "break-all" }}>{setup.secret}</code>
        </dd>
        <dt>URI</dt>
        <dd>
          <a href={setup.uri}>アプリで開く</a>
        </dd>
      </dl>
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      <label>
        アプリに表示された6桁コード
        <input name="code" inputMode="numeric" autoComplete="one-time-code" required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        有効化する
      </button>
    </form>
  );
}
