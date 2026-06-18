param(
  [switch]$Reinstall,
  [string]$HostIp = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$needsInstall = $Reinstall `
  -or -not (Test-Path (Join-Path $Root "backend\venv\Scripts\python.exe")) `
  -or -not (Test-Path (Join-Path $Root "confluence\backend\venv\Scripts\python.exe")) `
  -or -not (Test-Path (Join-Path $Root "gatestorage\backend\venv\Scripts\python.exe")) `
  -or -not (Test-Path (Join-Path $Root "frontend\node_modules")) `
  -or -not (Test-Path (Join-Path $Root "confluence\frontend\node_modules")) `
  -or -not (Test-Path (Join-Path $Root "gatestorage\frontend\node_modules"))

if ($needsInstall) {
  & (Join-Path $PSScriptRoot "install-local.ps1")
}

& (Join-Path $PSScriptRoot "start-local.ps1") -HostIp $HostIp
