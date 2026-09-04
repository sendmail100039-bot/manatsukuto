<#
.SYNOPSIS
  Company Platform - Windows server initial setup.
.DESCRIPTION
  Checks Node.js / pnpm / PostgreSQL client tools, installs dependencies,
  creates .env if missing, applies DB migrations, seeds master data and builds the web app.
  Run from the repository root as Administrator:  powershell -ExecutionPolicy Bypass -File infrastructure\windows\setup.ps1
#>
[CmdletBinding()]
param(
  [switch]$Demo,          # seed demo organization / users (development only)
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root

function Require-Command($name, $hint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    Write-Error "$name が見つかりません。$hint"
  }
}
Require-Command node "Node.js 22 LTS をインストールしてください: winget install OpenJS.NodeJS.LTS"
$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) { Write-Error "Node.js 22 以上が必要です (現在: $(node --version))" }
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host "pnpm を有効化します (corepack)..."
  corepack enable
  corepack prepare pnpm@10.33.0 --activate
}
Require-Command psql "PostgreSQL 16 をインストールしてください: winget install PostgreSQL.PostgreSQL.16"

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  $secret = node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
  (Get-Content ".env") -replace "APP_SECRET=.*", "APP_SECRET=$secret" | Set-Content ".env"
  Write-Warning ".env を作成しました。DATABASE_URL / APP_ORIGIN を編集してから再実行してください。"
  exit 1
}

Write-Host "==> pnpm install"
pnpm install --frozen-lockfile

Write-Host "==> DB migrate"
pnpm db:migrate

if (-not $env:SEED_ADMIN_PASSWORD) {
  $pw = Read-Host "初期 system_admin のパスワード (10文字以上, 英数字混在)" -AsSecureString
  $env:SEED_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pw))
}
Write-Host "==> DB seed"
if ($Demo) { pnpm db:seed -- --demo } else { pnpm db:seed }

if (-not $SkipBuild) {
  Write-Host "==> build web"
  $env:NODE_ENV = "production"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  pnpm build
  if ($LASTEXITCODE -ne 0) { Write-Error "build failed" }
  # Next.js standalone output does not include static assets; copy them next to server.js.
  $standalone = "apps\web\.next\standalone\apps\web"
  New-Item -ItemType Directory -Force -Path "$standalone\.next" | Out-Null
  Remove-Item -Recurse -Force "$standalone\.next\static" -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force "$standalone\public" -ErrorAction SilentlyContinue
  Copy-Item -Recurse "apps\web\.next\static" "$standalone\.next\static"
  Copy-Item -Recurse "apps\web\public" "$standalone\public"
}
Write-Host "完了。start-web.ps1 / register-tasks.ps1 でサービスを起動・登録してください。"
