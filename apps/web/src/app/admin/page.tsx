import { hasAnyPermission, hasPermission } from "@platform/core";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "システム管理" };

export default async function AdminIndex() {
  const p = await requirePermissionPage(["core.user.admin", "system.settings", "system.audit.read", "core.device.write", "core.employee.write", "core.organization.write"]);
  const items = [
    { href: "/admin/users", label: "ユーザー管理", desc: "ログインアカウント、権限(ロール)の割当", show: hasPermission(p, "core.user.admin") },
    { href: "/admin/employees", label: "職員マスタ", desc: "職員の登録・変更", show: hasPermission(p, "core.employee.write") },
    { href: "/admin/organizations", label: "組織・部署", desc: "法人・事業所・部署の階層", show: hasPermission(p, "core.organization.write") },
    { href: "/manager/locations", label: "勤務拠点", desc: "GPS許容範囲の設定", show: hasPermission(p, "core.location.write") },
    { href: "/admin/devices", label: "端末管理", desc: "職員端末の承認・無効化", show: hasAnyPermission(p, ["core.device.read", "core.device.write"]) },
    { href: "/admin/settings", label: "システム設定", desc: "リスクスコア重み、閾値、ロックアウト等", show: hasAnyPermission(p, ["system.settings", "security.admin"]) },
    { href: "/admin/audit", label: "監査ログ", desc: "ログイン、打刻、承認、閲覧の記録", show: hasPermission(p, "system.audit.read") },
  ].filter((i) => i.show);
  return (
    <AppShell principal={p} title="システム管理">
      <div className="grid">
        {items.map((i) => (
          <a key={i.href} href={i.href} className="card" style={{ textDecoration: "none" }}>
            <h2>{i.label}</h2>
            <p className="muted">{i.desc}</p>
          </a>
        ))}
      </div>
    </AppShell>
  );
}
