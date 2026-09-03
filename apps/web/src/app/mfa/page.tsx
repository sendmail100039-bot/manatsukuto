import { redirect } from "next/navigation";
import { getMfaStatus } from "@platform/auth";
import { db } from "@/lib/db";
import { requireLogin } from "@/lib/session";
import { MfaEnroll, MfaVerify } from "./MfaForms";

export const metadata = { title: "追加認証" };

export default async function MfaPage() {
  const p = await requireLogin({ allowPending: true });
  if (p.mfaVerified) redirect("/");
  const status = await getMfaStatus(db(), p.userId);
  return (
    <main className="container narrow">
      <h1 style={{ marginTop: "2rem" }}>追加認証 (MFA)</h1>
      <p className="muted">本部管理者・セキュリティ管理者・システム管理者は、認証アプリによる二段階認証が必要です。</p>
      <div className="card">{status.enrolled ? <MfaVerify /> : <MfaEnroll account={p.loginId} />}</div>
      <form action="/logout" method="post">
        <button className="btn btn-sm" type="submit">
          ログアウト
        </button>
      </form>
    </main>
  );
}
