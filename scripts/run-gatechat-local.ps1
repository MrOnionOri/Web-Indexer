param(
  [string]$HostIp = "",
  [string]$OllamaBaseUrl = "",
  [string]$Model = "qwen2.5:7b-instruct",
  [string]$DbHost = "",
  [string]$DbPort = "",
  [string]$DbName = "",
  [string]$DbUser = "",
  [string]$DbPassword = "",
  [switch]$Reinstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$GateChatRoot = Join-Path $Root "gatechat"
$Backend = Join-Path $GateChatRoot "backend"
$Frontend = Join-Path $GateChatRoot "frontend"
$LogDir = Join-Path $Root "logs\local"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (-not $HostIp) {
  $HostIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1 -ExpandProperty IPAddress
  if (-not $HostIp) { $HostIp = "127.0.0.1" }
}

if (-not $OllamaBaseUrl) {
  $OllamaBaseUrl = if ($env:OLLAMA_BASE_URL) { $env:OLLAMA_BASE_URL } else { "http://127.0.0.1:11434" }
}

function Import-DotEnv {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $name, $value = $line.Split("=", 2)
    if (-not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

Import-DotEnv (Join-Path $Root ".env")

if (-not $DbHost) { $DbHost = if ($env:DB_HOST -and $env:DB_HOST -ne "host.docker.internal") { $env:DB_HOST } else { "localhost" } }
if (-not $DbPort) { $DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" } }
if (-not $DbName) { $DbName = if ($env:DB_NAME) { $env:DB_NAME } else { "gatestack" } }
if (-not $DbUser) { $DbUser = if ($env:GATECHAT_DB_USER) { $env:GATECHAT_DB_USER } else { "gatechat_app" } }
if (-not $DbPassword) { $DbPassword = $env:GATECHAT_DB_PASSWORD }

function New-PythonVenv {
  param([string]$Path)
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) {
    & $py.Source -3.11 -m venv (Join-Path $Path "venv")
    if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $Path "venv\Scripts\python.exe"))) {
      return
    }
  }
  $python = Get-Command python.exe -ErrorAction Stop
  & $python.Source -m venv (Join-Path $Path "venv")
}

if ($Reinstall -or -not (Test-Path (Join-Path $Backend "venv\Scripts\python.exe"))) {
  New-PythonVenv $Backend
}

$VenvPython = Join-Path $Backend "venv\Scripts\python.exe"
$SystemPython = (Get-Command python.exe -ErrorAction Stop).Source
$Python = if (Test-Path $VenvPython) { $VenvPython } else { $SystemPython }
$venvHasPip = $false
if (Test-Path $VenvPython) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & $VenvPython -m pip --version *> $null
  $ErrorActionPreference = $previousErrorActionPreference
  $venvHasPip = $LASTEXITCODE -eq 0
}

if ($venvHasPip) {
  & $Python -c "import fastapi, uvicorn, requests, dotenv, sqlalchemy, pymysql" *> $null
  $venvReady = $LASTEXITCODE -eq 0
} else {
  $venvReady = $false
}

if ($venvHasPip -and ($Reinstall -or -not $venvReady)) {
  Push-Location $Backend
  & $Python -m pip install --upgrade pip
  & $Python -m pip install -r requirements.txt
  Pop-Location
} elseif (-not $venvHasPip) {
  & $SystemPython -c "import fastapi, uvicorn, requests, dotenv, sqlalchemy, pymysql" *> $null
  if ($LASTEXITCODE -ne 0) {
    Push-Location $Backend
    & $SystemPython -m pip install -r requirements.txt
    Pop-Location
  }
  $Python = $SystemPython
}

if ($Reinstall -or -not (Test-Path (Join-Path $Frontend "node_modules"))) {
  Push-Location $Frontend
  npm install
  Pop-Location
}

function Start-LoggedProcess {
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

$env:GATECHAT_OLLAMA_BASE_URL = $OllamaBaseUrl.TrimEnd("/")
$env:GATECHAT_DEFAULT_MODEL = $Model
$env:DB_HOST = $DbHost
$env:DB_PORT = $DbPort
$env:DB_NAME = $DbName
$env:DB_USER = $DbUser
$env:DB_PASSWORD = $DbPassword
$env:VITE_SERVER_HOST = $HostIp
$env:VITE_SERVER_PROTOCOL = "http"
$env:VITE_GATECHAT_BACKEND_PORT = "8013"
[Environment]::SetEnvironmentVariable("Path", $env:Path, "Process")
[Environment]::SetEnvironmentVariable("PATH", $null, "Process")

$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npm = if ($npmCommand) { $npmCommand.Source } else { "npm" }

Start-LoggedProcess "gatechat-api" $Python @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8013") $Backend
Start-LoggedProcess "gatechat-web" $npm @("run", "dev", "--", "--host", "0.0.0.0", "--port", "5186") $Frontend

Write-Host ""
Write-Host "GateChat:  http://${HostIp}:5186"
Write-Host "API docs:  http://${HostIp}:8013/docs"
Write-Host "Ollama:    $OllamaBaseUrl"
Write-Host "Model:     $Model"
Write-Host "Logs:      $LogDir"
