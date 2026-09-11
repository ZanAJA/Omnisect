$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$processes = New-Object System.Collections.ArrayList

function Write-Line {
  param(
    [string]$Prefix,
    [string]$Line,
    [ConsoleColor]$Color = [ConsoleColor]::Gray
  )

  if ([string]::IsNullOrWhiteSpace($Line)) {
    return
  }

  $oldColor = [Console]::ForegroundColor
  [Console]::ForegroundColor = $Color
  [Console]::Write("[$Prefix] ")
  [Console]::ForegroundColor = $oldColor
  [Console]::WriteLine($Line)
}

function Start-AppProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command,
    [string]$Arguments,
    [ConsoleColor]$Color,
    [hashtable]$Environment = @{}
  )

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $Command
  $startInfo.Arguments = $Arguments
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.CreateNoWindow = $true

  foreach ($key in $Environment.Keys) {
    $startInfo.Environment[$key] = [string]$Environment[$key]
  }

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  $process.EnableRaisingEvents = $true

  $stdoutAction = {
    if ($EventArgs.Data) {
      Write-Line -Prefix $Event.MessageData.Name -Line $EventArgs.Data -Color $Event.MessageData.Color
    }
  }
  $stderrAction = {
    if ($EventArgs.Data) {
      Write-Line -Prefix $Event.MessageData.Name -Line $EventArgs.Data -Color $Event.MessageData.Color
    }
  }

  $null = Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action $stdoutAction -MessageData @{ Name = $Name; Color = $Color }
  $null = Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action $stderrAction -MessageData @{ Name = $Name; Color = $Color }

  if (-not $process.Start()) {
    throw "Failed to start $Name"
  }

  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()
  [void]$processes.Add($process)

  return $process
}

function Stop-Apps {
  foreach ($process in $processes) {
    if ($process -and -not $process.HasExited) {
      try {
        if ($env:OS -eq "Windows_NT") {
          & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
        } else {
          $process.Kill()
        }
        $process.WaitForExit(3000) | Out-Null
      } catch {}
    }
  }
}

try {
  $env:OMNISECT_ROOT = $root
  $backendHost = if ($env:HOST) { $env:HOST } else { "127.0.0.1" }
  $backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } elseif ($env:PORT -and $env:PORT -ne "5173") { $env:PORT } else { "3001" }
  $frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "5173" }

  Write-Host "Starting Omnisect..."
  Write-Host "Root:     $root"
  Write-Host "Backend:  http://${backendHost}:${backendPort}"
  Write-Host "Frontend: http://127.0.0.1:${frontendPort}"
  Write-Host "Press Ctrl+C to stop both."
  Write-Host ""

  $backend = Start-AppProcess `
    -Name "backend" `
    -WorkingDirectory (Join-Path $root "backend") `
    -Command "node.exe" `
    -Arguments "server.js" `
    -Color Cyan `
    -Environment @{
      OMNISECT_ROOT = $root
      HOST = $backendHost
      PORT = $backendPort
    }

  $frontend = Start-AppProcess `
    -Name "frontend" `
    -WorkingDirectory (Join-Path $root "frontend") `
    -Command "node.exe" `
    -Arguments "scripts/vite-dev.mjs" `
    -Color Green `
    -Environment @{
      OMNISECT_ROOT = $root
      PORT = $frontendPort
    }

  while ($true) {
    if ($backend.HasExited) {
      throw "Backend stopped with exit code $($backend.ExitCode)."
    }
    if ($frontend.HasExited) {
      throw "Frontend stopped with exit code $($frontend.ExitCode)."
    }
    Start-Sleep -Milliseconds 500
  }
} finally {
  Stop-Apps
  Get-EventSubscriber | Where-Object { $_.SourceObject -is [System.Diagnostics.Process] } | Unregister-Event
  Write-Host ""
  Write-Host "Omnisect stopped."
}
