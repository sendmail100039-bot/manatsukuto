<#
.SYNOPSIS  Windows Firewall hardening (§28 DB非公開, §27 HTTPS only). Run as Administrator.
  - Blocks inbound PostgreSQL (5432) from any network.
  - Blocks inbound to the Node app port (3000) - only the local reverse proxy / tunnel may reach it.
  - Allows 443 (and 80 for ACME redirect) only when using Caddy directly. With Cloudflare Tunnel no inbound port is required.
#>
param([switch]$AllowCaddyPorts)
$ErrorActionPreference = "Stop"
New-NetFirewallRule -DisplayName "CompanyPlatform - block PostgreSQL inbound" -Direction Inbound -Protocol TCP -LocalPort 5432 -Action Block -Profile Any -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "CompanyPlatform - block app port inbound" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Block -Profile Any -ErrorAction SilentlyContinue | Out-Null
if ($AllowCaddyPorts) {
  New-NetFirewallRule -DisplayName "CompanyPlatform - allow HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
  New-NetFirewallRule -DisplayName "CompanyPlatform - allow HTTP (redirect/ACME)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
}
Write-Host "firewall rules applied. Also set listen_addresses='localhost' in postgresql.conf."
