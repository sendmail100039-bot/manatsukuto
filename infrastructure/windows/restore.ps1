<#
.SYNOPSIS  Restore a pg_dump custom-format backup into a database (§51 復旧確認).
.EXAMPLE   .\restore.ps1 -File .\backups\platform-2026-09-03T02-00-00.dump -TargetDatabaseUrl postgres://platform:pw@127.0.0.1:5432/platform_restore_test
#>
param(
  [Parameter(Mandatory)] [string]$File,
  [Parameter(Mandatory)] [string]$TargetDatabaseUrl
)
$ErrorActionPreference = "Stop"
if (-not (Test-Path $File)) { Write-Error "not found: $File" }
$pgRestore = if ($env:PG_RESTORE_PATH) { $env:PG_RESTORE_PATH } else { "pg_restore" }
Write-Host "restoring $File -> $TargetDatabaseUrl"
& $pgRestore --clean --if-exists --no-owner --dbname=$TargetDatabaseUrl $File
if ($LASTEXITCODE -ne 0) { Write-Error "pg_restore failed ($LASTEXITCODE)" }
& psql $TargetDatabaseUrl -c "select count(*) as employees from employees; select count(*) as attendance_events from attendance_events; select count(*) as audit_logs from audit_logs;"
Write-Host "restore complete. 復旧訓練の場合は対象DBを削除してください。"
