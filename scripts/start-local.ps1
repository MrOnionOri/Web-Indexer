param(
  [string]$HostIp = "",
  [string]$DbHost = "",
  [string]$DbPort = "",
  [string]$DbUser = "",
  [string]$DbPassword = "",
  [string]$DbName = "gatestack",
  [string]$SecretKey = "",
  [string]$DataEncryptionKey = "",
  [string]$OllamaBaseUrl = "",
  [string]$OllamaChatModel = "",
  [string]$OllamaEmbedModel = "",
  [string]$TesseractCmd = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return
  }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
      return
    }
    $name, $value = $line.Split("=", 2)
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-DotEnv (Join-Path $Root ".env")

if (-not $HostIp) {
  $HostIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $HostIp) { $HostIp = "127.0.0.1" }
}
if (-not $DbHost) {
  $DbHost = if ($env:DB_HOST -and $env:DB_HOST -ne "host.docker.internal") { $env:DB_HOST } else { "localhost" }
}
if (-not $DbPort) { $DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" } }
if (-not $SecretKey) {
  $SecretKey = $env:SECRET_KEY
}
if (-not $DataEncryptionKey) {
  $DataEncryptionKey = $env:DATA_ENCRYPTION_KEY
}
if (-not $SecretKey -or $SecretKey.Length -lt 32) {
  throw "SECRET_KEY must be set in .env or passed as -SecretKey with at least 32 characters."
}
if (-not $DataEncryptionKey -or $DataEncryptionKey.Length -lt 32) {
  throw "DATA_ENCRYPTION_KEY must be set in .env or passed as -DataEncryptionKey with at least 32 characters."
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
  $process = Start-Process -FilePath $FilePath `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru
  Set-Content -Path (Join-Path $LogDir "$Name.pid") -Value $process.Id
  Write-Host "Started $Name [$($process.Id)]"
}

$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_NAME = $DbName
$env:DB_TABLE_PREFIX = ""
$env:SECRET_KEY = $SecretKey
$env:DATA_ENCRYPTION_KEY = $DataEncryptionKey
$env:ACCESS_TOKEN_EXPIRE_MINUTES = "480"
$env:GATESTACK_API_URL = "http://${HostIp}:8000"
$env:GATESTORAGE_API_URL = "http://${HostIp}:8002"
$env:OLLAMA_BASE_URL = if ($OllamaBaseUrl) { $OllamaBaseUrl.TrimEnd("/") } elseif ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL.TrimEnd("/") } else { "http://127.0.0.1:11434" }
$env:OLLAMA_CHAT_MODEL = if ($OllamaChatModel) { $OllamaChatModel } elseif ($env:OLLAMA_CHAT_MODEL) { $env:OLLAMA_CHAT_MODEL } else { "gatewiki-assistant" }
$env:OLLAMA_EMBED_MODEL = if ($OllamaEmbedModel) { $OllamaEmbedModel } elseif ($env:OLLAMA_EMBED_MODEL) { $env:OLLAMA_EMBED_MODEL } else { "nomic-embed-text" }
if (-not $TesseractCmd -and (Test-Path "C:\Program Files\Tesseract-OCR\tesseract.exe")) {
  $TesseractCmd = "C:\Program Files\Tesseract-OCR\tesseract.exe"
}
if ($TesseractCmd) {
  $env:TESSERACT_CMD = $TesseractCmd
}
$env:STORAGE_ROOT = (Join-Path $Root "gatestorage\data\storage")
$env:BACKEND_CORS_ORIGINS = "http://${HostIp}:5173,http://${HostIp}:5174,http://${HostIp}:5175,http://${HostIp}:8001,http://localhost:5173,http://localhost:5174,http://localhost:5175"
$env:VITE_SERVER_HOST = $HostIp
$env:VITE_SERVER_PROTOCOL = "http"
$env:VITE_GATESTACK_BACKEND_PORT = "8000"
$env:VITE_GATEWIKI_BACKEND_PORT = "8001"
$env:VITE_GATESTORAGE_BACKEND_PORT = "8002"

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

$env:DB_USER = if ($DbUser) { $DbUser } elseif ($env:GATESTACK_DB_USER) { $env:GATESTACK_DB_USER } else { "gatestack_app" }
$env:DB_PASSWORD = if ($DbPassword) { $DbPassword } else { $env:GATESTACK_DB_PASSWORD }
Start-LocalProcess "gatestack-api" (Get-PythonPath $gateStackBackend) @("-m", "uvicorn", "app.main:app", "--host", $HostIp, "--port", "8000", "--reload") $gateStackBackend

$env:DB_USER = if ($DbUser) { $DbUser } elseif ($env:GATEWIKI_DB_USER) { $env:GATEWIKI_DB_USER } else { "gatewiki_app" }
$env:DB_PASSWORD = if ($DbPassword) { $DbPassword } else { $env:GATEWIKI_DB_PASSWORD }
Start-LocalProcess "gatewiki-api" (Get-PythonPath $gateWikiBackend) @("-m", "uvicorn", "main:app", "--host", $HostIp, "--port", "8001", "--reload") $gateWikiBackend

$env:DB_USER = if ($DbUser) { $DbUser } elseif ($env:GATESTORAGE_DB_USER) { $env:GATESTORAGE_DB_USER } else { "gatestorage_app" }
$env:DB_PASSWORD = if ($DbPassword) { $DbPassword } else { $env:GATESTORAGE_DB_PASSWORD }
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
