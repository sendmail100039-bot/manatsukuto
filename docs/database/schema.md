# データベース設計

PostgreSQL 16 / Drizzle ORM。スキーマの正本は `packages/database/src/schema.ts`、マイグレーションは `packages/database/migrations/*.sql`(`pnpm db:generate` で生成、`pnpm db:migrate` で適用)。

## テーブル一覧

### Core
| テーブル | 役割 | 主な列 |
| --- | --- | --- |
| `organizations` | 法人・事業所(階層) | code, name, kind(corporation/office), parent_id |
| `departments` | 部署(階層) | organization_id, code, name, parent_id |
| `employees` | 職員マスタ(共通ID) | employee_number, name, name_kana, organization_id, department_id, primary_location_id, employment_type, hired_on, retired_on, status |
| `users` | 認証ユーザー(職員と分離) | login_id, employee_id(1:1), status, auth_method, mfa_required, last_login_at |
| `user_credentials` | パスワードハッシュ(scrypt) | password_hash, must_change_password, failed_attempts, locked_until |
| `user_mfa` | TOTP シークレット(AES-256-GCM 暗号化) | secret_encrypted, confirmed_at, recovery_codes_hash |
| `user_sessions` | サーバ側セッション(Cookie トークンの SHA-256) | expires_at, mfa_verified, revoked_at |
| `login_attempts` | ログイン試行(Brute Force 対策) | login_id, ip_address, success |
| `locations` | 勤務拠点 | latitude, longitude, radius_meters, valid_from/valid_to, punch_allowed |
| `devices` | 職員端末(複数可) | employee_id, device_key, os, approval_status, disabled |
| `roles`, `permissions`, `role_permissions`, `user_roles` | RBAC | |

### Attendance
| テーブル | 役割 |
| --- | --- |
| `attendance_events` | 打刻の生データ(**追記専用**)。サーバ時刻、端末時刻、GPS、端末、IP、request_id(単回使用) |
| `attendance_records` | 勤務日単位の勤怠記録。修正時は新しい版を作成し旧版を `superseded` にする(`supersedes_record_id` / `superseded_by_record_id` / `version`) |
| `attendance_requests` | 打刻修正申請(時刻修正 / 打刻追加 / 記録取消) |
| `attendance_approvals` | 承認・却下。承認者、コメント、**元レコードのスナップショット**、新レコードID |

### Shift / Leave (Phase 2)
| テーブル | 役割 |
| --- | --- |
| `shift_patterns` | 勤務時間帯パターン(早番・日勤・遅番・夜勤。終了が開始以前なら翌日) |
| `shifts` | 職員×勤務日のシフト(1 日 1 件、planned → published、cancelled) |
| `leave_types` | 休暇種別(有給/無給、付与消費の有無、半休可否) |
| `leave_balances` | 職員×種別×年度の付与・使用(半日単位の整数) |
| `leave_requests` / `leave_approvals` | 休暇申請と承認履歴。申請中は残日数を予約扱い |
| `attendance_breaks` | 休憩(開始/終了打刻に紐づく) |

### Security
| テーブル | 役割 |
| --- | --- |
| `risk_assessments` | 打刻ごとのスコア・レベル・判定理由(JSON) |
| `location_checks` | 距離、許容半径、範囲内、前回打刻との距離・時間・速度、Impossible Travel |
| `device_checks` | 端末登録・承認・初回、Mock Location、Integrity |
| `security_events` | 要確認イベント(REVIEW/HIGH_RISK)。本部の確認状態・メモ |

### System
| テーブル | 役割 |
| --- | --- |
| `audit_logs` | 監査ログ(**UPDATE/DELETE をトリガーで拒否**) |
| `system_settings` | JSON 設定(リスク重み・閾値、Replay、ロックアウト、端末自動登録) |
| `idempotency_keys` | 打刻の Idempotency Key(TTL 付き) |

## 不変性・整合性
- `audit_logs` と `attendance_events` は `audit_logs_block_mutation()` トリガーで UPDATE / DELETE を拒否(`0001_audit_log_protection.sql`)。
- 職員ごとに `status='open'` のレコードは 1 件のみ(部分ユニーク索引 `attendance_records_one_open_idx`)。
- 打刻処理は職員単位の advisory lock でシリアライズし、二重送信を防ぐ。

## 時刻
全て `timestamptz`。勤務日 `work_date` はサーバ時刻を Asia/Tokyo(`BUSINESS_TIME_ZONE`)へ変換して決定する。
