# Daily pull from GitHub - protects against local data loss.
# Triggered by Windows Task Scheduler (see install-pull-task.ps1).
# Logs to data/.pull.log.

$repoPath = "C:\Users\janma\Desktop\AI\dandom-market-stats"
$logFile = Join-Path $repoPath "data\.pull.log"

$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Set-Location $repoPath

# Don't redirect stderr (PowerShell 5.1 wraps it in ErrorRecord which sets $? to false).
# Capture stdout only; exit code is the source of truth.
$output = git pull --rebase --autostash origin main
$exit = $LASTEXITCODE

$status = if ($exit -eq 0) { "OK" } else { "FAIL (exit $exit)" }
$entry = "[$ts] $status`n$($output -join "`n")`n"
Add-Content -Path $logFile -Value $entry -Encoding UTF8

if ($exit -ne 0) { exit $exit }
