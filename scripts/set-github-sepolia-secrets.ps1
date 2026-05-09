param(
  [string]$EnvFile = ".env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
  throw "Missing env file: $EnvFile"
}

$values = @{}
Get-Content -LiteralPath $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq "" -or $line.StartsWith("#")) {
    return
  }

  $parts = $line -split "=", 2
  if ($parts.Length -ne 2) {
    return
  }

  $values[$parts[0]] = $parts[1]
}

function Test-Placeholder {
  param(
    [string]$Name,
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $true
  }

  $normalized = $Value.Trim()
  $zeroOwner = "0x0000000000000000000000000000000000000001"
  $zeroPot = "0x0000000000000000000000000000000000000002"

  if ($normalized -in @("0xyourprivatekey", "replace-with-your-key", $zeroOwner, $zeroPot)) {
    return $true
  }

  return $false
}

$secretNames = @(
  "SEPOLIA_RPC_URL",
  "SEPOLIA_WS_URL",
  "PRIVATE_KEY",
  "ETHERSCAN_API_KEY",
  "PHASE1_INITIAL_OWNER",
  "ADMIN_MULTISIG_ADDRESS",
  "ADMIN_TIMELOCK_DELAY_SECONDS",
  "ADMIN_TIMELOCK_PROPOSERS",
  "ADMIN_TIMELOCK_EXECUTORS",
  "ADMIN_TIMELOCK_ADMIN",
  "PHASE1_SLASHED_POT",
  "PHASE1_ADAPTER_ADDRESS",
  "PHASE2_SETTLEMENT_ENGINE",
  "PHASE3_AVS",
  "KEEPER_FHEOS_ENDPOINT"
)

$setSecrets = @()
$skippedSecrets = @()

foreach ($name in $secretNames) {
  $value = $values[$name]
  if (Test-Placeholder -Name $name -Value $value) {
    $skippedSecrets += $name
    continue
  }

  gh secret set $name --body $value | Out-Null
  $setSecrets += $name
}

Write-Host "Set GitHub secrets:" -ForegroundColor Green
if ($setSecrets.Count -eq 0) {
  Write-Host "  (none)"
} else {
  $setSecrets | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "Skipped secrets:" -ForegroundColor Yellow
if ($skippedSecrets.Count -eq 0) {
  Write-Host "  (none)"
} else {
  $skippedSecrets | ForEach-Object { Write-Host "  $_" }
}
