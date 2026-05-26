# Installs Windows Task Scheduler task for daily pull from GitHub.
# Run once as USER (not admin): powershell -ExecutionPolicy Bypass -File scripts/install-pull-task.ps1

$taskName = "DanDom-MarketStats-DailyPull"
$repoPath = "C:\Users\janma\Desktop\AI\dandom-market-stats"
$scriptPath = Join-Path $repoPath "scripts\local-pull.ps1"

if (-not (Test-Path $scriptPath)) {
  Write-Error "Not found: $scriptPath"
  exit 1
}

Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At "10:00"

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopOnIdleEnd `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Daily git pull for dandom-market-stats local backup."

Write-Host "OK - task registered: $taskName"
Write-Host "Run manually: Start-ScheduledTask -TaskName '$taskName'"
