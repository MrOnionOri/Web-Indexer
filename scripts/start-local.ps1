param(
  [string]$HostIp = "192.168.1.150",
  [string]$DbHost = "localhost",
  [string]$DbPort = "3306",
  [string]$DbUser = "root",
  [string]$DbPassword = "",
  [string]$DbName = "gatestack",
  [string]$SecretKey = "change-this-secret-key"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $DbPassword) {
  $DbPassword = Read-Host "MySQL password"
}
$LogDir = Join-Path $Root "logs\local"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Get-PythonPath {
  param([string]$ServicePath)
  $venvPython = Join-Path $ServicePath "venv\Scripts\python.exe"
  if (Test-Path $venvPython) {
    return $venvPython
  }
  return "python"
}

function Start-LocalProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
  )

  $outLog = Join-Path $LogDir "$Name.out.log"
  $errLog = Join-Path $LogDir "$Name.err.log"
  Start-Process -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog
  Write-Host "Started $Name"
}

$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:DB_NAME = $DbName
$env:DB_TABLE_PREFIX = ""
$env:SECRET_KEY = $SecretKey
$env:ACCESS_TOKEN_EXPIRE_MINUTES = "480"
$env:GATESTACK_API_URL = "http://${HostIp}:8000"
$env:GATESTORAGE_API_URL = "http://${HostIp}:8002"
$env:STORAGE_ROOT = (Join-Path $Root "gatestorage\data\storage")
$env:BACKEND_CORS_ORIGINS = "http://${HostIp}:5173,http://${HostIp}:5174,http://${HostIp}:5175,http://${HostIp}:8001,http://localhost:5173,http://localhost:5174,http://localhost:5175"
$env:VITE_API_BASE_URL = "http://${HostIp}:8000"
$env:VITE_GATEWIKI_BACKEND_URL = "http://${HostIp}:8001"
$env:VITE_GATESTORAGE_BACKEND_URL = "http://${HostIp}:8002"

$gateStackBackend = Join-Path $Root "backend"
$gateWikiBackend = Join-Path $Root "confluence\backend"
$gateStorageBackend = Join-Path $Root "gatestorage\backend"
$gateStackFrontend = Join-Path $Root "frontend"
$gateWikiFrontend = Join-Path $Root "confluence\frontend"
$gateStorageFrontend = Join-Path $Root "gatestorage\frontend"
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCommand) {
  $npm = $npmCommand.Source
} else {
  $npm = "npm"
}

Start-LocalProcess "gatestack-api" (Get-PythonPath $gateStackBackend) @("-m", "uvicorn", "app.main:app", "--host", $HostIp, "--port", "8000", "--reload") $gateStackBackend
Start-LocalProcess "gatewiki-api" (Get-PythonPath $gateWikiBackend) @("-m", "uvicorn", "main:app", "--host", $HostIp, "--port", "8001", "--reload") $gateWikiBackend
Start-LocalProcess "gatestorage-api" (Get-PythonPath $gateStorageBackend) @("-m", "uvicorn", "main:app", "--host", $HostIp, "--port", "8002", "--reload") $gateStorageBackend

Start-LocalProcess "gatestack-web" $npm @("run", "dev", "--", "--host", $HostIp, "--port", "5173") $gateStackFrontend
Start-LocalProcess "gatewiki-web" $npm @("run", "dev", "--", "--host", $HostIp, "--port", "5174") $gateWikiFrontend
Start-LocalProcess "gatestorage-web" $npm @("run", "dev", "--", "--host", $HostIp, "--port", "5175") $gateStorageFrontend

Write-Host ""
Write-Host "GateStack:    http://${HostIp}:5173"
Write-Host "GateWiki:     http://${HostIp}:5174"
Write-Host "GateStorage:  http://${HostIp}:5175"
Write-Host "API docs:     http://${HostIp}:8000/docs | http://${HostIp}:8001/docs | http://${HostIp}:8002/docs"
Write-Host "Logs:         $LogDir"
