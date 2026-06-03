param(
  [string]$DbPassword = "",
  [string]$DbUser = "root",
  [string]$DbName = "gatestack"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $DbPassword) {
  $DbPassword = Read-Host "MySQL password"
}

function Ensure-Venv {
  param([string]$Path)
  if (-not (Test-Path (Join-Path $Path "venv\Scripts\python.exe"))) {
    Push-Location $Path
    python -m venv venv
    Pop-Location
  }
}

function Pip-Install {
  param([string]$Path)
  Push-Location $Path
  .\venv\Scripts\python.exe -m pip install --upgrade pip
  .\venv\Scripts\python.exe -m pip install -r requirements.txt
  Pop-Location
}

Ensure-Venv (Join-Path $Root "backend")
Ensure-Venv (Join-Path $Root "confluence\backend")
Ensure-Venv (Join-Path $Root "gatestorage\backend")

Pip-Install (Join-Path $Root "backend")
Pip-Install (Join-Path $Root "confluence\backend")
Pip-Install (Join-Path $Root "gatestorage\backend")

Push-Location (Join-Path $Root "frontend")
npm install
Pop-Location

Push-Location (Join-Path $Root "confluence\frontend")
npm install
Pop-Location

Push-Location (Join-Path $Root "gatestorage\frontend")
npm install
Pop-Location

$mysql = Get-Command mysql -ErrorAction SilentlyContinue
if ($mysql) {
  & $mysql.Source -u $DbUser "-p$DbPassword" -e "CREATE DATABASE IF NOT EXISTS $DbName CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
} else {
  Write-Warning "mysql CLI no esta en PATH. Crea manualmente la base '$DbName' si no existe."
}

Write-Host "Dependencias listas para modo local sin Docker."
