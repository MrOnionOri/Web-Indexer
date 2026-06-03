param(
  [int[]]$Ports = @(8000, 8001, 8002, 5173, 5174, 5175)
)

$ErrorActionPreference = "Continue"

foreach ($port in $Ports) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $processId = $connection.OwningProcess
    if ($processId) {
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      if ($process) {
        Write-Host "Stopping port $port -> $($process.ProcessName) [$processId]"
        Stop-Process -Id $processId -Force
      }
    }
  }
}

Write-Host "Local GateStack/GateWiki/GateStorage ports stopped."
