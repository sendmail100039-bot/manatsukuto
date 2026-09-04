# Starts the Next.js web app in production mode (standalone server).
# Listens on 127.0.0.1:PORT only; HTTPS is terminated by Caddy / cloudflared in front of it.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
Get-Content ".env" | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}
$env:NODE_ENV = "production"
$env:HOSTNAME = "127.0.0.1"
if (-not $env:PORT) { $env:PORT = "3000" }
$server = "apps\web\.next\standalone\apps\web\server.js"
if (-not (Test-Path $server)) { Write-Error "ビルドがありません。先に setup.ps1 (または pnpm build) を実行してください。" }
if (-not (Test-Path "apps\web\.next\standalone\apps\web\.next\static")) { Write-Error "静的アセットが未配置です。setup.ps1 を再実行してください。" }
New-Item -ItemType Directory -Force -Path "logs" | Out-Null
node $server 2>&1 | Tee-Object -FilePath "logs\web.log" -Append
