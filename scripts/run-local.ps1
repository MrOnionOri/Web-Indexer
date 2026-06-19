param(
  [switch]$Reinstall,
  [string]$HostIp = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Test-PythonModules {
  param([string]$PythonPath, [string]$Imports)
  if (-not (Test-Path $PythonPath)) { return $false }
  & $PythonPath -c $Imports 2>$null
  return $LASTEXITCODE -eq 0
}

$needsInstall = $Reinstall `
  -or -not (Test-Path (Join-Path $Root "backend\venv\Scripts\python.exe")) `
  -or -not (Test-Path (Join-Path $Root "confluence\backend\venv\Scripts\python.exe")) `
  -or -not (Test-Path (Join-Path $Root "gatestorage\backend\venv\Scripts\python.exe")) `
  -or -not (Test-PythonModules (Join-Path $Root "backend\venv\Scripts\python.exe") "import fastapi, sqlalchemy, pydantic_settings") `
  -or -not (Test-PythonModules (Join-Path $Root "confluence\backend\venv\Scripts\python.exe") "import fastapi, sqlalchemy, dotenv, cryptography") `
  -or -not (Test-PythonModules (Join-Path $Root "gatestorage\backend\venv\Scripts\python.exe") "import fastapi, sqlalchemy, dotenv, cryptography") `
  -or -not (Test-Path (Join-Path $Root "frontend\node_modules")) `
  -or -not (Test-Path (Join-Path $Root "confluence\frontend\node_modules")) `
  -or -not (Test-Path (Join-Path $Root "gatestorage\frontend\node_modules"))

if ($needsInstall) {
  & (Join-Path $PSScriptRoot "install-local.ps1")
}

& (Join-Path $PSScriptRoot "start-local.ps1") -HostIp $HostIp
