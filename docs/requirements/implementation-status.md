# 実装状況 (MVP §55 対応表)

| 区分 | 要件 | 状態 | 実装箇所 |
| --- | --- | --- | --- |
| Core | 職員マスタ | ✅ | `packages/core/src/masters.ts`, `/admin/employees` |
| Core | 組織・部署(階層) | ✅ | `organizations.parent_id`, `departments.parent_id`, `/admin/organizations` |
| Core | 拠点(GPS許容半径・有効期間・打刻可否) | ✅ | `locations`, `/manager/locations` |
| Core | ユーザー(職員と分離) | ✅ | `users` ↔ `employees`, `/admin/users` |
| Core | 端末(複数端末・承認・無効化) | ✅ | `devices`, `/admin/devices` |
| Core | 権限(5ロール + security.* 権限) | ✅ | `packages/database/src/catalog.ts` |
| Core | 監査ログ(追記専用) | ✅ | `audit_logs` + DBトリガー, `/admin/audit` |
| Attendance | GPS出勤 / 退勤 | ✅ | `modules/attendance/src/punch.ts`, `/api/attendance/punch` |
| Attendance | サーバ時刻を正式時刻に | ✅ | `attendance_events.server_time` (端末時刻は補助保存) |
| Attendance | GPS距離判定(サーバ側) | ✅ | `packages/security/src/geo.ts` (haversine) |
| Attendance | 勤怠履歴 | ✅ | `/history`, `/manager/attendance` |
| Attendance | 修正申請 / 承認(元データ保持) | ✅ | `attendance_requests` / `attendance_approvals`, 版管理 (`supersedes_record_id`) |
| Attendance | CSV出力 | ✅ | `/api/attendance/export` (UTF-8 BOM) |
| Security | GPS精度確認 | ✅ | `GPS_ACCURACY_POOR` |
| Security | 位置異常検知 | ✅ | `OUTSIDE_LOCATION` / `FAR_OUTSIDE_LOCATION` / `GPS_MISSING` |
| Security | Impossible Travel | ✅ | `packages/security/src/travel.ts` |
| Security | 登録端末確認 | ✅ | `UNREGISTERED_DEVICE` / `UNAPPROVED_DEVICE` |
| Security | Risk Score(重み・閾値変更可) | ✅ | `system_settings["security.risk"]`, `/admin/settings` |
| Security | 本部専用 Security Dashboard | ✅ | `/security` (security.risk.read) |
| Security | Security Event(確認・判定) | ✅ | `security_events`, `/security/events/[id]` |
| Security | 一般職員への非表示 | ✅ | API は打刻結果のみ返却、画面は権限でガード |
| Security | Mock Location / Integrity(申告値) | 🔶 受け口のみ | ネイティブアプリからの申告値が来れば加点。ブラウザからは取得不可 |
| Security | Mock Location 検知強化(Web で可能な範囲) | ✅ Phase 2 | `GPS_STALE`(古い位置情報)、`POSITION_REPEATED`(前回と完全同一座標)、`GPS_ACCURACY_IMPLAUSIBLE`(不自然に高精度) |
| Security | 動的QR / 拠点コード | ✅ Phase 2 | 拠点ごとの TOTP(60 秒)、表示画面 `/site-display/[id]?key=…`、`SITE_CODE_*` 加減点 |
| Attendance | 休憩管理 | ✅ Phase 2 | `attendance_breaks`、休憩開始/終了打刻、`break_minutes`、実働時間、CSV 列 |
| Infra | HTTPS(外部通信) | ✅ | Caddy / Cloudflare Tunnel 構成 (`infrastructure/`) |
| Infra | DB非公開 | ✅ | compose でポート非公開、`firewall.ps1` |
| Infra | Secret管理 | ✅ | `.env`(git 管理外)、`.env.example` |
| Infra | Backup / Restore | ✅ | `apps/worker`, `backup.ps1`, `restore.ps1` |
| Infra | Monitoring | ✅ | `/api/health`、worker の health ログ・Webhook 通知 |
| Infra | GitHub / CI/CD | ✅ | `.github/workflows/platform-ci.yml` |
| Auth | 自前認証(scrypt) + セッション | ✅ | `packages/auth` |
| Auth | MFA(TOTP)必須: head_office / security_admin / system_admin | ✅ | `/mfa` |
| Auth | Brute Force 対策 / ロックアウト | ✅ | `login_attempts`, `user_credentials.locked_until` |
| Auth | CSRF / Replay / 重複打刻 | ✅ | Origin 検査、request_id 単回使用、advisory lock、部分ユニーク索引 |

| Phase 2 | NFC / Beacon / Device・App Integrity / Wi-Fi 補助判定 | ⛔ 対象外(Web) | ブラウザからは NFC・Beacon・SSID・整合性 API にアクセスできないため、ネイティブアプリ化時に実装 |

凡例: ✅ 実装済 / 🔶 部分実装 / ⛔ 技術的に Web では不可
