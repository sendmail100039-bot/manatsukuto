import { redirect } from "next/navigation";
import { getPrincipal } from "@/lib/session";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "ログイン" };

export default async function LoginPage() {
  if (await getPrincipal()) redirect("/");
  return (
    <main className="container narrow">
      <div style={{ textAlign: "center", margin: "2rem 0 1rem" }}>
        <h1>勤怠システム</h1>
        <p className="muted">職員用ログイン</p>
      </div>
      <div className="card">
        <LoginForm />
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>
        通信はHTTPSで保護されています。ログイン情報は他人と共有しないでください。
      </p>
    </main>
  );
}
