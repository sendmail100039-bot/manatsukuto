import { and, desc, eq, gte, lte, like } from "drizzle-orm";
import { formatDateTime } from "@platform/core";
import { auditLogs, users } from "@platform/database";
import { db } from "@/lib/db";
import { requirePermissionPage } from "@/lib/session";
import { AppShell } from "@/components/AppShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "監査ログ" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; from?: string; to?: string; user?: string }> }) {
  const p = await requirePermissionPage("system.audit.read");
  const sp = await searchParams;
  const conds = [];
  if (sp.action) conds.push(like(auditLogs.action, `${sp.action.replace(/[%_]/g, "")}%`));
  if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) conds.push(gte(auditLogs.occurredAt, new Date(`${sp.from}T00:00:00+09:00`)));
  if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) conds.push(lte(auditLogs.occurredAt, new Date(`${sp.to}T23:59:59+09:00`)));
  if (sp.user) conds.push(eq(users.loginId, sp.user));
  const rows = await db()
    .select({ log: auditLogs, actorLogin: users.loginId })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(500);
  return (
    <AppShell principal={p} title="監査ログ">
      <form className="row card" method="get">
        <label>
          アクション(前方一致)
          <input name="action" defaultValue={sp.action ?? ""} placeholder="例: security. / attendance." />
        </label>
        <label>
          ユーザー
          <input name="user" defaultValue={sp.user ?? ""} />
        </label>
        <label>
          開始
          <input type="date" name="from" defaultValue={sp.from ?? ""} />
        </label>
        <label>
          終了
          <input type="date" name="to" defaultValue={sp.to ?? ""} />
        </label>
        <button className="btn btn-primary" type="submit">
          検索
        </button>
      </form>
      <p className="muted small">監査ログは追記専用です(変更・削除はDBトリガーで拒否されます)。最大500件表示。</p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>日時</th>
              <th>ユーザー</th>
              <th>アクション</th>
              <th>対象</th>
              <th>IP</th>
              <th>詳細</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.log.id}>
                <td>{r.log.id}</td>
                <td>{formatDateTime(r.log.occurredAt)}</td>
                <td>{r.actorLogin ?? "—"}</td>
                <td>
                  <code>{r.log.action}</code>
                </td>
                <td className="small">
                  {r.log.targetType ?? ""} {r.log.targetId ? r.log.targetId.slice(0, 8) : ""}
                </td>
                <td>{r.log.ipAddress ?? ""}</td>
                <td className="wrap small">
                  <code>{r.log.details ? JSON.stringify(r.log.details) : ""}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
