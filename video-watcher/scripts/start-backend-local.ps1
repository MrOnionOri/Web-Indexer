param(
  [int]$Port = 8003,
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$BackendDir = Resolve-Path (Join-Path $PSScriptRoot "..\backend")
$VenvDir = Join-Path $BackendDir ".venv"
$PythonExe = Join-Path $VenvDir "Scripts\python.exe"

Set-Location $BackendDir

if (-not (Test-Path $PythonExe)) {
  python -m venv $VenvDir
  $Install = $true
}

if ($Install) {
  & $PythonExe -m pip install --upgrade pip
  & $PythonExe -m pip install -r requirements.txt
}

if (-not (Test-Path ".env.local") -and (Test-Path ".env.local.example")) {
  Copy-Item ".env.local.example" ".env.local"
  Write-Host "Created backend\.env.local. Update DB_PASSWORD if your MySQL requires it."
}

$env:PYTHONPATH = $BackendDir
& $PythonExe -m uvicorn app.main:app --host 127.0.0.1 --port $Port --reload
