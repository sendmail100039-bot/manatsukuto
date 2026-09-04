# Starts the background worker (cleanup / health / backup).
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
$env:NODE_ENV = "production"
New-Item -ItemType Directory -Force -Path "logs" | Out-Null
pnpm --filter @platform/worker start 2>&1 | Tee-Object -FilePath "logs\worker.log" -Append
