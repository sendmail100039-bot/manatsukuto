# バックアップと復旧

## 方針 (§50, §51)
- `pg_dump --format=custom` によるフルバックアップを **毎日 02:00** に取得(タスクスケジューラ `CompanyPlatform-Backup`、または worker の `BACKUP_INTERVAL_HOURS`)。
- 保存先 `BACKUP_DIR`(既定 `./backups`)。`BACKUP_RETENTION_DAYS`(既定 30 日)で古いものを削除。
- バックアップファイルは **別媒体 / 別拠点**(NAS、外付け、クラウドストレージの無料枠等)へも複製すること。同一ディスクのみでは災害対策にならない。
- `.env`(Secret)はバックアップに含めない。アクセス制御された場所に別途保管する。
- 1 KB 未満のダンプは失敗とみなしエラー扱い。`NOTIFY_WEBHOOK_URL` 設定時は成功/失敗を Webhook 通知。

## 手動バックアップ
```powershell
powershell -File infrastructure\windows\backup.ps1
# または
pnpm --filter @platform/worker backup
```

## 復旧
```powershell
# 1. 復旧先 DB を作成
psql -U postgres -c "CREATE DATABASE platform_restore OWNER platform;"
# 2. 復元
powershell -File infrastructure\windows\restore.ps1 -File .\backups\platform-2026-09-03T02-00-00.dump -TargetDatabaseUrl postgres://platform:<pw>@127.0.0.1:5432/platform_restore
# 3. 件数確認後、本番へ切替(DATABASE_URL 変更 → Web/Worker 再起動)
```

## 復旧訓練(月次推奨)
1. 最新バックアップを `platform_restore_test` へ復元
2. `employees` / `attendance_events` / `audit_logs` の件数が本番と一致することを確認
3. テスト DB を削除し、結果を運用記録に残す
