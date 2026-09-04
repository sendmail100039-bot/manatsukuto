# MANATSUKUTO — 公開サイト & 共通業務プラットフォーム

このリポジトリには 2 つのものが入っています。

| ディレクトリ | 内容 |
| --- | --- |
| `site/` | MANATSUKUTO(マナツクト)公式 Web サイト(GitHub Pages で公開) |
| それ以外 | **GPS機能付き出退勤システム・共通業務プラットフォーム**(要件仕様書 v0.4 準拠の MVP) |

---

## 共通業務プラットフォーム (Company Platform)

職員がスマートフォンから HTTPS 経由で出勤・退勤を記録し、GPS 情報で勤務場所を確認できる勤怠システムです。勤怠に閉じず、シフト・休暇・給与連携などを **モジュール** として追加できるモジュラーモノリス構成になっています。

- サーバ: **Windows**(Node.js 22 + PostgreSQL 16。Docker Desktop でも可)
- 端末: 各職員のスマートフォンのブラウザ(PWA 対応、iOS / Android)
- 仕様書: [`docs/requirements/requirements-v0.4.md`](docs/requirements/requirements-v0.4.md) / 実装状況: [`docs/requirements/implementation-status.md`](docs/requirements/implementation-status.md)

### 構成

```
apps/web            Next.js 16 (職員・管理者・本部・システム管理の全画面 + JSON API)
apps/worker         バックアップ / クリーンアップ / ヘルスチェック
modules/attendance  勤怠モジュール(打刻、記録、修正申請、承認、CSV)
modules/shift       シフト管理(パターン、割当、公開、勤怠との突合)
modules/leave       休暇申請・有休管理(種別、付与、申請、承認、残日数)
packages/core       共通コア(職員・組織・拠点・端末・権限・監査ログ・設定)
packages/auth       自前認証(scrypt)、セッション、TOTP MFA、ロックアウト、Origin 検査
packages/security   GPS 距離計算、拠点判定、Impossible Travel、リスクスコア、Security Event
packages/database   Drizzle スキーマ、マイグレーション、シード、ロール/権限カタログ
infrastructure/     docker / windows(PowerShell) / caddy / cloudflare
docs/               requirements / database / security / operations
tests/              unit(vitest) / integration(実 PostgreSQL)
```

### クイックスタート(開発)

```bash
corepack enable && pnpm install
cp .env.example .env            # DATABASE_URL / APP_SECRET / APP_ORIGIN を設定
pnpm db:migrate
SEED_ADMIN_PASSWORD='AdminPassword1!' pnpm db:seed -- --demo   # --demo は開発用データ
pnpm dev                        # http://localhost:3000
```

デモユーザー(`--demo` 時、パスワード `Password123!`): `yamada`(一般職員) / `suzuki`(管理者) / `takahashi`(本部管理者・MFA 必須) / `admin`(システム管理者)

### テスト

```bash
pnpm typecheck
pnpm test                 # ユニット
pnpm test:integration     # PostgreSQL が必要 (TEST_DATABASE_URL、既定 127.0.0.1:5433)
pnpm build
```

### 本番(Windows)

[`docs/operations/windows-setup.md`](docs/operations/windows-setup.md) を参照。`infrastructure/windows/setup.ps1` → `register-tasks.ps1` → Cloudflare Tunnel または Caddy で HTTPS 公開。

### 設計上のポイント

- 正式な打刻時刻は **サーバ時刻**。GPS 距離・拠点判定・リスクスコアはすべてサーバ側で計算し、外部 API に依存しない。
- 一般職員には「出勤しました 07:48」だけを返し、リスク判定は本部の Security Dashboard でのみ閲覧可能。閲覧自体も監査ログに残る。
- HIGH_RISK でも打刻は拒否せず、不正の確定・勤怠の自動変更は行わない(本部担当者が確認)。
- 勤怠データは上書きせず、修正申請 → 承認で新しい版を作成(元データ + 申請 + 修正後 + 承認者を保持)。
- 監査ログと打刻イベントは DB トリガーで UPDATE/DELETE を拒否。
- Replay / 二重打刻対策: 単回使用の requestId、端末時刻の鮮度チェック、職員単位ロック、「出勤中は 1 件」制約。

---

## 公式 Web サイト (`site/`)

### Local preview

```powershell
python -m http.server 4173 --directory site
```

Open `http://127.0.0.1:4173/` in a browser.

### Contact form

The initial form uses the visitor's email application and does not transmit form data to a third-party form service. A future provider endpoint can be configured in `site/assets/site-config.js` after its privacy, retention, quota, and notification settings are approved.

### Brand assets

The B2 Segmented M direction is approved, but the final logo file and rights review are pending. Until that review is complete, the site uses the approved `MANATSUKUTO` text name and does not include a provisional logo image.
