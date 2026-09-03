<#
.SYNOPSIS  Register Task Scheduler tasks: web + worker at startup, daily backup at 02:00. Run as Administrator.
#>
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$ps = "powershell.exe"
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -MultipleInstances IgnoreNew

$web = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Root\infrastructure\windows\start-web.ps1`"" -WorkingDirectory $Root
Register-ScheduledTask -TaskName "CompanyPlatform-Web" -Action $web -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Force | Out-Null

$worker = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Root\infrastructure\windows\start-worker.ps1`"" -WorkingDirectory $Root
Register-ScheduledTask -TaskName "CompanyPlatform-Worker" -Action $worker -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $settings -Force | Out-Null

$backup = New-ScheduledTaskAction -Execute $ps -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Root\infrastructure\windows\backup.ps1`"" -WorkingDirectory $Root
Register-ScheduledTask -TaskName "CompanyPlatform-Backup" -Action $backup -Trigger (New-ScheduledTaskTrigger -Daily -At 2:00AM) -Principal $principal -Force | Out-Null

Write-Host "登録しました: CompanyPlatform-Web, CompanyPlatform-Worker (起動時), CompanyPlatform-Backup (毎日 02:00)"
Write-Host "今すぐ起動: Start-ScheduledTask CompanyPlatform-Web; Start-ScheduledTask CompanyPlatform-Worker"
