param(
  [int]$Port = 5176,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$FrontendDir = Resolve-Path (Join-Path $PSScriptRoot "..\frontend")

Set-Location $FrontendDir

if (-not (Test-Path ".env.local") -and (Test-Path ".env.local.example")) {
  Copy-Item ".env.local.example" ".env.local"
}

if (-not (Test-Path "node_modules")) {
  npm install
}

npm run dev -- --host $HostName --port $Port
