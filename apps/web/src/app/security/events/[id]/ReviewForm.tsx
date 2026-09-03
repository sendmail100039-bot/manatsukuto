"use client";

import { useActionState } from "react";
import { reviewAction } from "./actions";

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewAction, undefined);
  return (
    <form action={action} className="stack">
      {state?.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state?.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <input type="hidden" name="id" value={id} />
      <label>
        確認メモ
        <textarea name="note" rows={3} placeholder="本人への確認内容、判断理由など" />
      </label>
      <div className="actions">
        <button className="btn btn-primary" name="decision" value="reviewed" type="submit" disabled={pending}>
          確認済にする
        </button>
        <button className="btn" name="decision" value="dismissed" type="submit" disabled={pending}>
          問題なし
        </button>
        <button className="btn btn-danger" name="decision" value="confirmed" type="submit" disabled={pending}>
          不正の疑いを確定(人事対応へ)
        </button>
      </div>
      <p className="muted small">システムは不正を確定しません。勤怠の変更・給与控除・懲戒等は本システム外の手続きで判断してください。</p>
    </form>
  );
}
