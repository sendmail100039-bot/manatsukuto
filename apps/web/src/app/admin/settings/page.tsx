import { formatDateTime, listSettings } from "@platform/core";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";
import { SettingForm } from "./SettingForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "システム設定" };

export default async function SettingsPage() {
  const p = await requirePermissionPage(["system.settings", "security.admin"]);
  const rows = await listSettings(db());
  return (
    <AppShell principal={p} title="システム設定">
      <p className="muted">リスクスコアの重み・閾値(§21)、Replay対策、ロックアウト等はここで変更できます。値はJSONで保存され、変更は監査ログに記録されます。</p>
      {rows.map((r) => (
        <div className="card" key={r.key}>
          <h2>
            <code>{r.key}</code>
          </h2>
          <p className="muted small">
            {r.description ?? ""} — 最終更新 {formatDateTime(r.updatedAt)}
          </p>
          <SettingForm settingKey={r.key} value={JSON.stringify(r.value, null, 2)} />
        </div>
      ))}
    </AppShell>
  );
}
