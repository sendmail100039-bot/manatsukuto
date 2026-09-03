# 監視 (§52)

| 項目 | 手段 |
| --- | --- |
| サーバ死活 | `GET /api/health`(DB 接続込み)。UptimeRobot 等の無料外形監視から 5 分間隔で監視 |
| エラー | `logs\web.log`, `logs\worker.log`(タスクスケジューラ経由)。Windows イベントログへの転送は任意 |
| DB 状態・容量 | worker が 1 時間ごとに `pg_database_size` と接続数を JSON ログ出力し、Webhook 通知 |
| バックアップ | worker / `backup.ps1` の成功・失敗通知、`backups\` の最新ファイル日時 |
| TLS 証明書 | Caddy / Cloudflare が自動更新。外形監視の証明書期限チェックを併用 |
| セキュリティ異常 | `/security` の未確認件数、監査ログの `auth.login_failed` 増加、`security_events(status='open')` |

## 通知
`NOTIFY_WEBHOOK_URL` に Slack / Discord / Microsoft Teams 等の Incoming Webhook(無料枠)を設定すると、worker が `{"text": "..."}` を POST します。`NotificationProvider` を差し替えれば別サービスへ移行できます。

## 無料枠の監視 (§4.3)
Cloudflare / 外形監視 / Webhook の利用量はそれぞれのダッシュボードで月次確認し、上限接近時は `docs/operations/deployment-options.md` の代替へ切り替えます。
