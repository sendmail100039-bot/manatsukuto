# Windows サーバ用スクリプト

| スクリプト | 用途 |
| --- | --- |
| `setup.ps1` | 依存関係のインストール、`.env` 作成補助、DBマイグレーション・シード、本番ビルド |
| `start-web.ps1` | Web アプリ (Next.js) を本番モードで起動 |
| `start-worker.ps1` | ワーカー(バックアップ・クリーンアップ・監視)を起動 |
| `backup.ps1` | `pg_dump` による手動/定期バックアップ |
| `restore.ps1` | バックアップからの復元(復旧訓練にも使用) |
| `register-tasks.ps1` | タスクスケジューラに Web / Worker の自動起動と日次バックアップを登録 |
| `firewall.ps1` | Windows ファイアウォール設定(PostgreSQL の外部公開を禁止) |

PowerShell は **管理者として実行** してください。詳細は `docs/operations/windows-setup.md` を参照。
