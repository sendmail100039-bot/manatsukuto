import { eq } from "drizzle-orm";
import { getMfaStatus } from "@platform/auth";
import { userCredentials } from "@platform/database";
import { db } from "@/lib/db";
import { requireLogin } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { PasswordForm } from "./PasswordForm";

export const metadata = { title: "アカウント設定" };

export default async function PasswordPage() {
  const p = await requireLogin({ allowPending: true });
  const [cred] = await db().select({ must: userCredentials.mustChangePassword }).from(userCredentials).where(eq(userCredentials.userId, p.userId));
  const mfa = await getMfaStatus(db(), p.userId);
  return (
    <AppShell principal={p} title="アカウント設定">
      {cred?.must ? <div className="alert alert-info">初回ログインのため、パスワードを変更してください。</div> : null}
      <div className="card">
        <h2>パスワード変更</h2>
        <PasswordForm />
      </div>
      <div className="card">
        <h2>二段階認証 (MFA)</h2>
        <p>
          状態: {mfa.enrolled ? <span className="badge badge-ok">有効</span> : <span className="badge badge-muted">未設定</span>}
        </p>
        <p className="muted small">本部・セキュリティ・システム管理者はログイン時に必須です。一般職員も任意で設定できます。</p>
        <a className="btn btn-sm" href="/mfa">
          {mfa.enrolled ? "再設定する" : "設定する"}
        </a>
      </div>
    </AppShell>
  );
}
