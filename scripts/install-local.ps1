param(
  [string]$DbPassword = "",
  [string]$DbUser = "root",
  [string]$DbName = "gatestack",
  [string]$DbHost = "",
  [string]$DbPort = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

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

if (-not $DbPassword) {
  $DbPassword = $env:MYSQL_ROOT_PASSWORD
}
if (-not $DbHost) {
  $DbHost = if ($env:DB_HOST -and $env:DB_HOST -ne "host.docker.internal") { $env:DB_HOST } else { "localhost" }
}
if (-not $DbPort) {
  $DbPort = if ($env:DB_PORT) { $env:DB_PORT } else { "3306" }
}

function New-PythonVenv {
  param([string]$Path)
  $py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($py) {
    & $py.Source -3.11 -m venv (Join-Path $Path "venv")
    return
  }
  $python = Get-Command python.exe -ErrorAction Stop
  $version = & $python.Source -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
  if ($version -ne "3.11") {
    throw "Python 3.11 x64 is required. Installed version: $version"
  }
  & $python.Source -m venv (Join-Path $Path "venv")
}

function Ensure-Venv {
  param([string]$Path)
  if (-not (Test-Path (Join-Path $Path "venv\Scripts\python.exe"))) {
    New-PythonVenv $Path
  }
}

function Pip-Install {
  param([string]$Path)
  Push-Location $Path
  .\venv\Scripts\python.exe -m pip install --upgrade pip
  .\venv\Scripts\python.exe -m pip install -r requirements.txt
  Pop-Location
}

function Escape-SqlLiteral {
  param([string]$Value)
  return ($Value -replace "\\", "\\\\" -replace "'", "''")
}

function New-AppUserSql {
  param(
    [string]$User,
    [string]$Password,
    [string]$HostName,
    [string]$Database
  )
  if (-not $User -or -not $Password) { return "" }
  $escapedUser = Escape-SqlLiteral $User
  $escapedPassword = Escape-SqlLiteral $Password
  @"
CREATE USER IF NOT EXISTS '$escapedUser'@'$HostName' IDENTIFIED BY '$escapedPassword';
ALTER USER '$escapedUser'@'$HostName' IDENTIFIED BY '$escapedPassword';
GRANT ALL PRIVILEGES ON ``$Database``.* TO '$escapedUser'@'$HostName';
"@
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
if ($mysql -and $DbPassword) {
  $sql = @"
CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
$(New-AppUserSql $env:GATESTACK_DB_USER $env:GATESTACK_DB_PASSWORD "localhost" $DbName)
$(New-AppUserSql $env:GATESTACK_DB_USER $env:GATESTACK_DB_PASSWORD "%" $DbName)
$(New-AppUserSql $env:GATEWIKI_DB_USER $env:GATEWIKI_DB_PASSWORD "localhost" $DbName)
$(New-AppUserSql $env:GATEWIKI_DB_USER $env:GATEWIKI_DB_PASSWORD "%" $DbName)
$(New-AppUserSql $env:GATESTORAGE_DB_USER $env:GATESTORAGE_DB_PASSWORD "localhost" $DbName)
$(New-AppUserSql $env:GATESTORAGE_DB_USER $env:GATESTORAGE_DB_PASSWORD "%" $DbName)
FLUSH PRIVILEGES;
"@
  & $mysql.Source -h $DbHost -P $DbPort -u $DbUser "-p$DbPassword" -e $sql
} elseif ($mysql) {
  Write-Warning "MYSQL_ROOT_PASSWORD is not set. Database creation was skipped."
} else {
  Write-Warning "mysql CLI no esta en PATH. Crea manualmente la base '$DbName' si no existe."
}

$tesseract = Get-Command tesseract.exe -ErrorAction SilentlyContinue
if (-not $tesseract -and -not (Test-Path "C:\Program Files\Tesseract-OCR\tesseract.exe")) {
  Write-Warning "Tesseract no esta en PATH. El OCR de imagenes requiere instalar Tesseract OCR o pasar -TesseractCmd al arrancar."
}

Write-Host "Dependencias listas para modo local sin Docker."
