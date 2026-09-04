# 本番展開チェックリスト(Windows サーバ)

上から順に実行してください。所要時間の目安は 1〜2 時間です。各手順の詳細は `windows-setup.md` を参照。

## 0. 事前に用意するもの

- [ ] 公開用ドメイン(例 `kintai.example.com`)。Cloudflare で DNS を管理できること(無料プラン可)
- [ ] Windows サーバ(Windows 10/11 Pro または Windows Server 2019 以降)への管理者権限
- [ ] PostgreSQL の `platform` ユーザー用パスワード(20 文字以上を推奨)
- [ ] 初期 system_admin のパスワード(10 文字以上、英数字混在)
- [ ] 管理者のスマートフォンに認証アプリ(Google Authenticator / Microsoft Authenticator)

## 1. ソフトウェア導入(管理者 PowerShell)

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL.16
winget install Git.Git
winget install Cloudflare.cloudflared
corepack enable; corepack prepare pnpm@10.33.0 --activate
```
- [ ] PowerShell を開き直し、`node --version`(22 以上)、`psql --version`(16)、`pnpm --version` が表示される

## 2. データベース作成

```powershell
psql -U postgres
```
```sql
CREATE USER platform WITH PASSWORD '<用意したパスワード>';
CREATE DATABASE platform OWNER platform;
\q
```
- [ ] `C:\Program Files\PostgreSQL\16\data\postgresql.conf` の `listen_addresses = 'localhost'` を確認

## 3. アプリ配置

```powershell
git clone https://github.com/sendmail100039-bot/manatsukuto.git C:\apps\platform
cd C:\apps\platform
powershell -ExecutionPolicy Bypass -File infrastructure\windows\setup.ps1
```
- [ ] 1 回目は `.env` が生成されて停止する。`notepad .env` で次を編集
  - `DATABASE_URL=postgres://platform:<パスワード>@127.0.0.1:5432/platform`
  - `APP_ORIGIN=https://kintai.example.com`
  - `NODE_ENV=production`
  - `TRUST_PROXY=true`
- [ ] `setup.ps1` を再実行し、初期 system_admin のパスワードを入力する
- [ ] 完了メッセージが出る(依存関係 → マイグレーション → シード → ビルド)

## 4. 動作確認(ローカル)

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure\windows\start-web.ps1
```
- [ ] 別の PowerShell で `curl.exe http://127.0.0.1:3000/api/health` が `{"ok":true,"db":"up",...}` を返す
- [ ] ブラウザで `http://127.0.0.1:3000/login` が表示される(この時点ではまだログインしない)
- [ ] Ctrl+C で停止

## 5. 自動起動とバックアップの登録

```powershell
powershell -ExecutionPolicy Bypass -File infrastructure\windows\register-tasks.ps1
Start-ScheduledTask CompanyPlatform-Web
Start-ScheduledTask CompanyPlatform-Worker
```
- [ ] `Get-ScheduledTask CompanyPlatform-*` で 3 件(Web / Worker / Backup)が `Ready` または `Running`
- [ ] `curl.exe http://127.0.0.1:3000/api/health` が再び成功する

## 6. HTTPS 公開(Cloudflare Tunnel)

```powershell
cloudflared tunnel login                      # ブラウザで Cloudflare にログインしドメインを選択
cloudflared tunnel create kintai              # 出力される UUID を控える
Copy-Item infrastructure\cloudflare\config.example.yml $env:USERPROFILE\.cloudflared\config.yml
notepad $env:USERPROFILE\.cloudflared\config.yml   # tunnel / credentials-file / hostname を編集
cloudflared tunnel route dns kintai kintai.example.com
cloudflared service install
powershell -ExecutionPolicy Bypass -File infrastructure\windows\firewall.ps1
```
- [ ] スマートフォンから `https://kintai.example.com/login` が開く(鍵マーク付き)
- [ ] Cloudflare ダッシュボード → Security → WAF で Managed Rules が有効(無料プラン既定)

## 7. 初回ログインと初期設定

- [ ] `admin` と初期パスワードでログイン → 認証アプリで MFA を登録 → リカバリーコードを保管
- [ ] パスワードを変更する
- [ ] システム管理 → 組織・部署 を登録
- [ ] 勤務拠点 を登録(緯度・経度は OpenStreetMap で確認、許容半径は 100〜300 m を目安)
- [ ] 職員マスタ を登録し、ユーザー を作成してロールを割り当てる
- [ ] テスト職員のスマートフォンで出勤・退勤を行い、勤怠一覧と Security Dashboard に反映されることを確認

## 8. 運用開始前の最終確認

- [ ] `powershell -File infrastructure\windows\backup.ps1` を手動実行し、`backups\` にファイルができる
- [ ] `restore.ps1` でテスト DB に復元できる(`backup-restore.md`)
- [ ] バックアップの複製先(NAS / クラウド)を決めて設定する
- [ ] `.env` のコピーをアクセス制限された場所に保管する
- [ ] 外形監視(UptimeRobot 等)に `https://kintai.example.com/api/health` を登録する

## 更新手順(以後のリリース)

```powershell
cd C:\apps\platform
Stop-ScheduledTask CompanyPlatform-Web; Stop-ScheduledTask CompanyPlatform-Worker
git pull
powershell -ExecutionPolicy Bypass -File infrastructure\windows\setup.ps1
Start-ScheduledTask CompanyPlatform-Web; Start-ScheduledTask CompanyPlatform-Worker
```
`setup.ps1` は再実行しても安全です(既存ユーザーがあれば admin は再作成されません)。
