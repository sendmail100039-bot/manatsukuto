# GPS機能付き出退勤システム・共通業務プラットフォーム 要件仕様書 (Version 0.4)

> 本書は発注時に提示された要件仕様書 v0.4 を、リポジトリ管理用に転記したものです。
> 実装状況は [implementation-status.md](./implementation-status.md) を参照してください。

## 前提条件(発注時の補足)

- サーバ: **Windows** (Node.js 22 + PostgreSQL 16 をローカル稼働。Docker Desktop でも可)
- 端末: **各職員のスマートフォン**(ブラウザ / PWA。iOS Safari / Android Chrome)

## 1. 目的

職員がスマートフォンまたはPCからインターネット経由で出勤・退勤を記録し、GPS情報を利用して勤務場所を確認できる勤怠管理システムを構築する。
単独の勤怠システムとして完結させず、シフト管理・休暇申請・給与連携・教育管理・資格管理・人事評価・在庫管理等をモジュール形式で追加できる共通業務プラットフォームとして設計する。
初期開発では **共通コア + 勤怠モジュール + セキュリティ機能 + 外部通信基盤** を構築する。

## 2. 基本コンセプト

```
Company Platform
├── Core
├── Security
├── Infrastructure
└── Modules
    ├── Attendance
    ├── Shift
    ├── Leave
    ├── Payroll
    ├── Education
    └── Future Modules
```

## 3. 開発基本方針

1. GitHubでソースコードを管理する
2. 外部ネットワークから利用可能とする
3. HTTPS通信を必須とする
4. データベースを直接外部公開しない
5. 職員情報とログイン情報を分離する
6. 業務モジュールを独立して追加可能とする
7. 勤怠データの変更履歴を保持する
8. GPS不正・偽装リスクを本部側で検知可能とする
9. 一般職員には内部セキュリティ判定を表示しない
10. 無料で利用可能な外部サービス・APIは利用可能とする
11. 基幹機能を特定の外部サービスへ強く依存させない
12. 将来的に自前サーバ・別クラウドへ移行可能とする

## 4. 外部サービス・API利用方針

- 無料で利用可能な外部API・クラウド・SaaS(ホスティング、DB、認証、CDN、WAF、DNS、GitHub、CI/CD、地図、通知)は利用可能。ただし依存を最小限にする。
- 初期MVPでは有料外部サービスを必須としない。導入時は必要性・月額・無料代替・移行コスト・データ移行方法を確認する。
- 無料枠超過時は自動課金へ移行せず、管理者通知→使用量確認→移行判断ができる構造とする。
- 外部サービス障害時も勤怠・職員・監査ログ・セキュリティデータが失われない設計とする。

## 5. 基幹機能の外部依存禁止

職員管理、勤怠記録、出勤・退勤判定、GPS距離計算、GPS拠点判定、リスクスコア計算、Impossible Travel判定、権限制御、打刻修正管理、監査ログは自システム内で実行する。GPS距離計算は Google Maps API 等を必須とせず、緯度・経度からサーバ側で計算する。

## 6. 想定利用者

| 利用者 | 機能 |
| --- | --- |
| 一般職員 | ログイン、出勤、退勤、勤怠履歴確認、打刻修正申請、申請状況確認 |
| 管理者 | 職員確認、勤怠一覧、修正承認、拠点管理、CSV出力 |
| 本部管理者 | 全体勤怠確認、異常打刻確認、セキュリティリスク確認、GPS異常確認 |
| システム管理者 | ユーザー管理、権限管理、セキュリティ設定、マスタ管理、システム設定、監査ログ確認 |

## 7. 共通コア

Organizations / Departments / Employees / Users / Locations / Devices / Roles / Permissions / Audit Logs

## 8. 職員マスタ

職員ID、職員番号、氏名、氏名カナ、所属法人、所属部署、主勤務拠点、雇用区分、入職日、退職日、在籍状態。職員IDは他モジュールから参照可能な共通IDとする。

## 9. ユーザー管理

職員情報と認証ユーザーを分離する(User → Employee)。ユーザーID、職員ID、ログイン情報、アカウント状態、最終ログイン、認証方式。

## 10. 組織・部署

階層構造(法人 → 事業所 → 部署)を利用可能とする。

## 11. 勤務拠点

拠点ID、拠点名、住所、緯度、経度、GPS許容半径、有効期間、打刻可否。拠点ごとにGPS許容範囲を設定できる。

## 12. 端末管理

端末ID、職員ID、OS、OSバージョン、アプリバージョン、初回利用日時、最終利用日時、承認状態、無効状態。1人の職員に複数端末を登録可能。

## 13. 勤怠モジュール

Clock In / Clock Out / Attendance Records / Attendance Events / Correction Requests / Approval

## 14–15. 出勤・退勤

職員ID、ユーザーID、端末情報、GPS緯度、GPS経度、GPS精度、クライアント時刻、サーバ受付時刻、対象勤務拠点を取得する。

## 16. 正式な打刻時刻

勤怠上の正式な時刻は **サーバ時刻** とする。端末時刻は異常判定等の補助情報として保存する。

## 17. GPS取得

ブラウザまたはネイティブアプリから緯度、経度、精度、速度、方角、高度、取得日時を取得する。外部GPSサービスは原則不要。

## 18. GPS距離判定

端末GPS → サーバ送信 → 拠点座標取得 → 距離計算 → 許容範囲判定。クライアント側の判定結果は信用しない。

## 19. GPS偽装・不正打刻検知

GPS位置、精度、取得履歴、Mock Location、登録端末、端末異常、App/Device Integrity、過去位置、過去打刻、移動速度、IP情報、認証履歴を組み合わせてリスク評価する。

## 20. Impossible Travel

短時間に物理的に不可能な移動(例: 07:30 東京 → 07:31 大阪)を異常イベントとして記録する。

## 21. リスクスコア

GPS正常 +0 / GPS精度異常 +20 / 未登録端末 +30 / Impossible Travel +80 / Mock Location +100。具体的な値は後から変更可能とする。

## 22. リスクレベル

NORMAL / REVIEW / HIGH_RISK の3段階。

## 23. 一般職員への非表示

Risk Score、GPS偽装疑い、Mock Location、Device/App Integrity、Impossible Travel、判定アルゴリズム、閾値、Security Event は一般職員に表示しない。一般職員には「出勤しました 07:48」のような通常の打刻結果のみ表示する。

## 24. 本部Security Dashboard

本日の打刻: 正常 / 要確認 / 高リスク の件数を確認可能とする。

## 25. セキュリティ詳細

本部権限ユーザーのみ、職員、打刻時刻、GPS、GPS精度、勤務拠点、拠点からの距離、使用端末、Risk Score、判定理由、過去リスク履歴を閲覧可能。

## 26. 不正確定

システム単独で不正を確定しない。HIGH_RISK でも本部担当者による確認対象とし、欠勤・遅刻・勤怠削除・給与控除・懲戒等を自動実行しない。

## 27. 外部通信

スマートフォン → HTTPS → Internet → CDN/WAF → Web Server → Application → Database。外部からの通信はHTTPSのみ。

## 28–29. データベース

PostgreSQL を基本候補とし、DBポートを外部公開しない。

- Core: organizations, departments, employees, users, locations, devices, roles, permissions, user_roles
- Attendance: attendance_records, attendance_events, attendance_requests, attendance_approvals
- Security: security_events, risk_assessments, device_checks, location_checks
- System: audit_logs, system_settings

## 30–31. 認証

無料認証サービスまたは自前認証から選択し、将来 Passkey / Google / Microsoft / SSO / MFA へ変更可能とする。本部管理者、security_admin、system_admin には MFA または Passkey を推奨する。

## 32–33. 権限

初期ロール: employee / manager / head_office / security_admin / system_admin。
Security 専用権限: security.risk.read / security.event.read / security.location.read / security.device.read / security.review / security.admin

## 34–35. 監査ログ・ログ保護

ログイン、出勤、退勤、勤怠修正、承認、職員情報変更、権限変更、GPS異常、セキュリティイベント、管理者によるGPS閲覧、管理者によるリスク情報閲覧を記録する。監査ログは通常のユーザーから変更できず、原則として物理削除しない。

## 36. データ変更

既存勤怠データを直接上書きしない。修正時は 元データ + 修正申請 + 修正後データ + 承認者 を保持する。

## 37–38. GitHub・Secret管理

Source Code、DB Migration、Requirements、Tests、Infrastructure、CI/CD、Documentation を GitHub で管理する。DB password、Secret Key、API Key、OAuth Secret、Private Key、Service Role Key をソースコードへ記述せず、環境変数または Secret 管理機能を利用する。

## 39–41. 無料サービス利用と抽象化

GitHub、Cloudflare、Supabase、Vercel、OpenStreetMap 系サービスなどを利用可能だが必須としない。StorageProvider / AuthProvider / MapProvider / NotificationProvider の抽象化層を設け、無料サービス終了時は別無料サービス・自前サーバ・セルフホスト・有料サービスへ変更可能とする。

## 42–45. コンテナ化・モジュラーモノリス・リポジトリ構成

Docker(web / worker / postgres / optional services)利用可能な構成。初期はモジュラーモノリスとし、規模拡大時に Attendance / Security / Shift / Notification Service 等へ分離可能とする。

```
company-platform/
├── apps/ (web, admin)
├── modules/ (attendance, shift, leave)
├── packages/ (core, auth, security, database, ui)
├── infrastructure/docker/
├── docs/ (requirements, database, security, operations)
└── tests/
```

## 46–49. セキュリティ

HTTPS、認証、権限制御、DB非公開、入力値検証、SQL Injection / XSS / CSRF 対策、Rate Limit、Brute Force 対策、Replay Attack 対策(Request ID / Timestamp / Nonce / Idempotency Key)、セッション管理、Secret 管理。通信遅延やボタン連打による二重登録を防止する。WAF が利用できない場合でもアプリ側の対策を省略しない。

## 50–53. バックアップ・復旧・監視・環境

無料枠でバックアップが提供されない場合は自前の定期バックアップ(PostgreSQL、重要設定、必要ファイル)。復元可能であることを定期的に確認する。サーバ死活、エラー、DB状態、容量、バックアップ、TLS証明書、セキュリティ異常を監視する。Development / Production(可能なら Staging も)を分離する。

## 54. 技術スタック候補

Frontend: Next.js + TypeScript / Database: PostgreSQL / Source Control: GitHub / Container: Docker。無料枠利用時は Vercel / Cloudflare / Supabase 等。利用サービスは固定しない。

## 55. MVP完成条件

- Core: 職員マスタ、組織、部署、拠点、ユーザー、端末、権限、監査ログ
- Attendance: GPS出勤、GPS退勤、サーバ時刻、GPS距離判定、勤怠履歴、修正申請、承認、CSV出力
- Security: GPS精度確認、位置異常検知、Impossible Travel、登録端末確認、Risk Score、本部専用Security Dashboard、Security Event、一般職員へのセキュリティ判定非表示
- Infrastructure: 外部インターネット接続、HTTPS、DB非公開、Secret管理、Backup、Monitoring、GitHub、CI/CD

## 56–58. Phase 2〜4

- Phase 2: Mock Location検知強化、Device/App Integrity、動的QR、NFC、Beacon、Wi-Fi補助判定、休憩管理、シフト管理、有休管理
- Phase 3: 給与連携、教育管理、資格管理、人事管理、人事評価
- Phase 4: AI不正パターン検知、AIシフト作成、人員配置予測、労働時間分析、管理者AIアシスタント

## 59–60. コスト方針・最終設計方針

月額固定費を可能な限り0円または低額に抑えるが、セキュリティ・データ保全・バックアップ・勤怠の正確性を犠牲にしない。外部無料サービスは「使えるものは利用する」一方「なくなってもシステムそのものを作り直さなくてよい」構造とし、低コストで開始して利用規模に応じて段階的に強化できる企業向け業務プラットフォームを構築する。
