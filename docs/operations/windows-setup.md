# Windows サーバ セットアップ手順

対象: Windows Server 2019/2022 または Windows 10/11 Pro。管理者権限の PowerShell で作業します。

## 1. 必要ソフトウェア

```powershell
winget install OpenJS.NodeJS.LTS          # Node.js 22 LTS
winget install PostgreSQL.PostgreSQL.16   # PostgreSQL 16 (psql / pg_dump を PATH に追加)
winget install Git.Git
winget install CaddyServer.Caddy          # 方式A: 直接公開する場合
winget install Cloudflare.cloudflared     # 方式B: Cloudflare Tunnel を使う場合
corepack enable; corepack prepare pnpm@10.33.0 --activate
```

PostgreSQL インストール後、`postgresql.conf` の `listen_addresses = 'localhost'` を確認し、アプリ用 DB とユーザーを作成します。

```sql
CREATE USER platform WITH PASSWORD '<強いパスワード>';
CREATE DATABASE platform OWNER platform;
```

## 2. リポジトリ取得と初期設定

```powershell
git clone https://github.com/sendmail100039-bot/manatsukuto.git C:\apps\platform
cd C:\apps\platform
powershell -ExecutionPolicy Bypass -File infrastructure\windows\setup.ps1
```

初回は `.env` が生成されて停止するので、以下を編集して再実行します。

| 変数 | 値 |
| --- | --- |
| `DATABASE_URL` | `postgres://platform:<パスワード>@127.0.0.1:5432/platform` |
| `APP_ORIGIN` | 公開 URL(例 `https://kintai.example.com`) |
| `APP_SECRET` | 自動生成済み(変更不要) |
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `true` |

再実行すると依存関係インストール → マイグレーション → 初期 `system_admin` 作成(パスワード入力)→ 本番ビルドが行われます。
デモデータが必要な場合は `-Demo` を付けます(本番では使用しないこと)。

## 3. 起動と自動起動

```powershell
# 手動起動(動作確認)
powershell -ExecutionPolicy Bypass -File infrastructure\windows\start-web.ps1
# 別ウィンドウで
powershell -ExecutionPolicy Bypass -File infrastructure\windows\start-worker.ps1

# タスクスケジューラに登録(起動時に Web / Worker、毎日 02:00 にバックアップ)
powershell -ExecutionPolicy Bypass -File infrastructure\windows\register-tasks.ps1
Start-ScheduledTask CompanyPlatform-Web; Start-ScheduledTask CompanyPlatform-Worker
```

`http://127.0.0.1:3000/api/health` が `{"ok":true,"db":"up"}` を返せば正常です。

## 4. HTTPS 公開

### 方式A: Caddy(固定 IP / ポート 80,443 を開けられる場合)
```powershell
$env:SITE_ADDRESS = "kintai.example.com"; $env:UPSTREAM = "127.0.0.1:3000"
caddy run --config infrastructure\caddy\Caddyfile
# サービス化: caddy service install などの手順は Caddy 公式ドキュメント参照
powershell -File infrastructure\windows\firewall.ps1 -AllowCaddyPorts
```

### 方式B: Cloudflare Tunnel(推奨。受信ポート開放不要、無料 WAF/CDN)
```powershell
cloudflared tunnel login
cloudflared tunnel create kintai
# infrastructure\cloudflare\config.example.yml を %USERPROFILE%\.cloudflared\config.yml にコピーして編集
cloudflared tunnel route dns kintai kintai.example.com
cloudflared service install
powershell -File infrastructure\windows\firewall.ps1
```

どちらの方式でも `.env` の `APP_ORIGIN` を公開 URL に合わせてください(CSRF 検査に使用)。

## 5. 初回ログイン
1. `https://<公開URL>/login` に `admin`(または `SEED_ADMIN_LOGIN`)でログイン
2. MFA(認証アプリ)を登録
3. パスワード変更
4. 「システム管理」から組織・部署・拠点・職員・ユーザーを登録

## 6. 更新手順
```powershell
cd C:\apps\platform
git pull
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm build
Restart-ScheduledTask は無いので: Stop-ScheduledTask CompanyPlatform-Web; Start-ScheduledTask CompanyPlatform-Web
```

## 7. Docker Desktop を使う場合
```powershell
docker compose -f infrastructure\docker\docker-compose.yml --env-file .env up -d --build
```
`.env` に `POSTGRES_PASSWORD`, `APP_SECRET`, `APP_ORIGIN`, `SITE_ADDRESS`, `SEED_ADMIN_PASSWORD` を設定してください。
