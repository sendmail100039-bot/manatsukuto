<#
.SYNOPSIS  pg_dump backup with retention (§50). Reads DATABASE_URL / BACKUP_DIR / BACKUP_RETENTION_DAYS from .env.
#>
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $Root
Get-Content ".env" | Where-Object { $_ -match "^\s*[A-Z_]+=" } | ForEach-Object {
  $k, $v = $_ -split "=", 2
  [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim(), "Process")
}
if (-not $env:DATABASE_URL) { Write-Error "DATABASE_URL が設定されていません" }
$dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { ".\backups" }
$retention = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 30 }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-ddTHH-mm-ss"
$file = Join-Path $dir "platform-$stamp.dump"
$pgDump = if ($env:PG_DUMP_PATH) { $env:PG_DUMP_PATH } else { "pg_dump" }
& $pgDump --format=custom --no-owner --file=$file $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed ($LASTEXITCODE)" }
$size = (Get-Item $file).Length
if ($size -lt 1024) { Write-Error "バックアップファイルが小さすぎます ($size bytes)" }
Write-Host "backup written: $file ($([math]::Round($size/1KB)) KB)"
Get-ChildItem $dir -Filter "platform-*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$retention) } | ForEach-Object {
  Remove-Item $_.FullName
  Write-Host "removed old backup: $($_.Name)"
}
# Copy .env (secrets!) is intentionally NOT included. Keep a separate, access-controlled copy of .env.
