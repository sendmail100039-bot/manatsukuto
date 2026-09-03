"use client";

import { useActionState } from "react";
import { decideAction } from "./actions";

export function DecisionForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideAction, undefined);
  if (state?.ok) return <div className="alert alert-ok">{state.message}</div>;
  return (
    <form action={action} className="row" style={{ marginTop: ".75rem" }}>
      {state?.error ? <div className="alert alert-error" style={{ flexBasis: "100%" }}>{state.error}</div> : null}
      <input type="hidden" name="requestId" value={requestId} />
      <label style={{ flex: "3 1 240px" }}>
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
