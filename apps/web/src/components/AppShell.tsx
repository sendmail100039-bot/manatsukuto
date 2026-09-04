import Link from "next/link";
import { hasAnyPermission, hasPermission, type Principal } from "@platform/core";

const NAV: { href: string; label: string; show: (p: Principal) => boolean }[] = [
  { href: "/", label: "打刻", show: (p) => hasPermission(p, "attendance.self.punch") },
  { href: "/history", label: "勤怠履歴", show: (p) => hasPermission(p, "attendance.self.read") },
  { href: "/requests", label: "修正申請", show: (p) => hasPermission(p, "attendance.self.request") },
  { href: "/shifts", label: "シフト", show: (p) => hasPermission(p, "shift.self.read") },
  { href: "/leave", label: "休暇", show: (p) => hasPermission(p, "leave.self.read") },
  { href: "/manager/attendance", label: "勤怠一覧", show: (p) => hasAnyPermission(p, ["attendance.team.read", "attendance.all.read"]) },
  { href: "/manager/requests", label: "承認", show: (p) => hasPermission(p, "attendance.request.approve") },
  { href: "/manager/shifts", label: "シフト管理", show: (p) => hasPermission(p, "shift.manage") },
  { href: "/manager/leave", label: "休暇承認", show: (p) => hasAnyPermission(p, ["leave.approve", "leave.admin"]) },
  { href: "/manager/locations", label: "拠点", show: (p) => hasPermission(p, "core.location.write") },
  { href: "/manager/employees", label: "職員", show: (p) => hasPermission(p, "core.employee.read") },
  { href: "/security", label: "Security", show: (p) => hasPermission(p, "security.risk.read") },
  { href: "/admin", label: "システム管理", show: (p) => hasAnyPermission(p, ["core.user.admin", "system.settings", "system.audit.read", "core.device.write"]) },
];

export function AppShell({ principal, children, title }: { principal: Principal; children: React.ReactNode; title?: string }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          勤怠システム
        </Link>
        <nav aria-label="メインメニュー">
          {NAV.filter((n) => n.show(principal)).map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="user">
          <span>{principal.loginId}</span>
          <Link href="/account/password">設定</Link>
          <form action="/logout" method="post" style={{ display: "inline" }}>
            <button className="btn btn-sm" type="submit" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.5)" }}>
              ログアウト
            </button>
          </form>
        </div>
      </header>
      <main className="container">
        {title ? <h1>{title}</h1> : null}
        {children}
      </main>
      <footer className="foot">Company Platform · 正式な打刻時刻はサーバ時刻です</footer>
    </div>
  );
}
