param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..")).Path,
  [string]$EnvFile = (Join-Path $ProjectRoot ".env"),
  [string[]]$Roles = @("auction-monitor", "cofhe-dispatcher", "avs-submitter")
)

$ErrorActionPreference = "Stop"

$runtimeFile = Join-Path $ProjectRoot "packages\\contracts\\deployments\\sepolia.runtime.json"
$deploymentFile = Join-Path $ProjectRoot "packages\\contracts\\deployments\\sepolia.json"
$stateDirectory = Join-Path $ProjectRoot "packages\\keeper\\state"
$node22Path = "C:\\Users\\Ahmed\\AppData\\Local\\Programs\\node-v22.22.2-win-x64"

if (-not (Test-Path $runtimeFile)) {
  throw "Missing runtime file: $runtimeFile"
}
if (-not (Test-Path $deploymentFile)) {
  throw "Missing deployment file: $deploymentFile"
}
if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile"
}
if (-not (Test-Path (Join-Path $ProjectRoot "packages\\keeper\\dist\\runner.js"))) {
  throw "Missing built keeper runtime. Run 'pnpm --filter keeper build' first."
}

New-Item -ItemType Directory -Force -Path $stateDirectory | Out-Null

$envEntries = @{}
foreach ($line in Get-Content $EnvFile) {
  if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith("#") -or $line -notmatch "=") {
    continue
  }

  $key, $value = $line -split "=", 2
  $envEntries[$key.Trim()] = $value.Trim()
}

$privateKey = $envEntries["PRIVATE_KEY"]
if ([string]::IsNullOrWhiteSpace($privateKey)) {
  throw "PRIVATE_KEY is missing in $EnvFile"
}
if (-not $privateKey.StartsWith("0x")) {
  $privateKey = "0x$privateKey"
}

$runtime = Get-Content $runtimeFile -Raw | ConvertFrom-Json
$deployment = Get-Content $deploymentFile -Raw | ConvertFrom-Json
$avsThreshold = if ($deployment.avsThreshold) { [int]$deployment.avsThreshold } else { 1 }
$commonEnvironment = [ordered]@{
  "PATH" = "$node22Path;$([Environment]::GetEnvironmentVariable('PATH', 'Process'))"
  "KEEPER_RPC_URL" = [string]$runtime.rpcUrl
  "KEEPER_WS_URL" = " "
  "KEEPER_REDIS_URL" = " "
  "KEEPER_MARKET_ADDRESS" = [string]$runtime.contracts.marketProxy
  "KEEPER_SETTLEMENT_ENGINE_ADDRESS" = [string]$runtime.contracts.settlementEngine
  "KEEPER_AVS_ADDRESS" = [string]$runtime.contracts.avs
  "KEEPER_FHEOS_ENDPOINT" = ""
  "KEEPER_FHEOS_API_KEY" = ""
  "KEEPER_POLL_INTERVAL_MS" = "30000"
  "KEEPER_FINALIZE_LEAD_SECONDS" = "60"
  "KEEPER_FINALIZATION_DRIFT_SECONDS" = "12"
  "KEEPER_REQUEST_TIMEOUT_MS" = "120000"
  "KEEPER_MAX_RETRIES" = "4"
  "KEEPER_RETRY_BASE_DELAY_MS" = "2000"
  "KEEPER_QUEUE_CAPACITY" = "256"
  "KEEPER_MAX_BATCH_SIZE" = "10"
  "KEEPER_LOCK_TTL_MS" = "90000"
  "KEEPER_MAX_PRIORITY_FEE_GWEI" = "2"
  "KEEPER_AVS_THRESHOLD" = "$avsThreshold"
  "KEEPER_AVS_OPERATOR_KEYS" = $privateKey
  "KEEPER_STATE_FILE_PATH" = (Join-Path $stateDirectory "sepolia-keeper-state.json")
  "KEEPER_SLASHING_LOG_PATH" = (Join-Path $stateDirectory "sepolia-slashing-log.json")
  "PRIVATE_KEY" = $privateKey
}

$roles = @(
  @{ Name = "auction-monitor"; RunnerArgument = "auction-monitor"; Port = "9401"; Log = "monitor.log" },
  @{ Name = "cofhe-dispatcher"; RunnerArgument = "cofhe-dispatcher"; Port = "9402"; Log = "dispatcher.log" },
  @{ Name = "avs-submitter"; RunnerArgument = "avs-submitter"; Port = "9403"; Log = "avs.log" }
)

$results = @()
foreach ($role in $roles) {
  if ($Roles -notcontains $role.Name) {
    continue
  }

  $logPath = Join-Path $stateDirectory $role.Log
  $commandLines = @("Set-Location '$ProjectRoot'")

  foreach ($entry in $commonEnvironment.GetEnumerator()) {
    $escapedValue = $entry.Value.Replace("'", "''")
    $commandLines += "`$env:$($entry.Key) = '$escapedValue'"
  }

  $commandLines += "`$env:KEEPER_METRICS_PORT = '$($role.Port)'"
  $commandLines += "Set-Location '$ProjectRoot\\packages\\keeper'"
  $commandLines += "node dist/runner.js $($role.RunnerArgument) *>> '$logPath'"

  $process = Start-Process -FilePath "$PSHOME\\powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", ($commandLines -join "; ")) `
    -WindowStyle Hidden `
    -PassThru

  $results += [pscustomobject]@{
    role = $role.Name
    processId = $process.Id
    logPath = $logPath
    metricsPort = $role.Port
  }
}

$results | ConvertTo-Json -Depth 3
