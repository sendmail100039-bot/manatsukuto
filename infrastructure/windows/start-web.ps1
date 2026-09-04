# Starts the Next.js web app in production mode (listens on 127.0.0.1:PORT; HTTPS is handled by Caddy / cloudflared).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
$env:NODE_ENV = "production"
if (-not $env:PORT) { $env:PORT = "3000" }
if (-not (Test-Path "apps\web\.next")) { Write-Error "ビルドがありません。先に setup.ps1 (または pnpm build) を実行してください。" }
New-Item -ItemType Directory -Force -Path "logs" | Out-Null
pnpm --filter @platform/web exec next start -p $env:PORT -H 127.0.0.1 2>&1 | Tee-Object -FilePath "logs\web.log" -Append
