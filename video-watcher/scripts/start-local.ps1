param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 5176
)

$ErrorActionPreference = "Stop"
$ScriptsDir = $PSScriptRoot

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $ScriptsDir "start-backend-local.ps1"),
  "-Port", "$BackendPort"
)

Start-Sleep -Seconds 2

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $ScriptsDir "start-frontend-local.ps1"),
  "-Port", "$FrontendPort"
)

Write-Host "Video Watcher local:"
Write-Host "  Backend  http://127.0.0.1:$BackendPort"
Write-Host "  Frontend http://127.0.0.1:$FrontendPort"
