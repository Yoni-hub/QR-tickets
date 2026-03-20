# QR Tickets - Deployment Orchestrator
# Usage: .\master.ps1 [-SkipDns] [-SkipProvision] [-SkipDeploy]
param(
  [switch]$SkipDns,
  [switch]$SkipProvision,
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load .env
$EnvFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile"
  exit 1
}

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#")) {
    $parts = $line -split "=", 2
    if ($parts.Length -eq 2) {
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim([char]34)
      $envVars[$key] = $val
      [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
}

$SSH_HOST    = $envVars["SSH_HOST"]
$SSH_PORT    = $envVars["SSH_PORT"]
$SSH_USER    = $envVars["SSH_USER"]
$SSH_KEY     = $envVars["SSH_KEY_PATH"]
$DOMAIN      = $envVars["DOMAIN"]
$PUBLIC_IP   = $envVars["PUBLIC_IP"]

$SshTarget = "${SSH_USER}@${SSH_HOST}"
$SshOpts   = "-i `"$SSH_KEY`" -p $SSH_PORT -o StrictHostKeyChecking=no -o BatchMode=yes"

function Invoke-Ssh($cmd) {
  Write-Host "[ssh] $cmd"
  $result = & ssh -i $SSH_KEY -p $SSH_PORT -o StrictHostKeyChecking=no -o BatchMode=yes $SshTarget $cmd
  if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $cmd" }
  return $result
}

function Send-File($local, $remote) {
  Write-Host "[scp] $local -> $remote"
  & scp -i $SSH_KEY -P $SSH_PORT -o StrictHostKeyChecking=no $local "${SshTarget}:${remote}"
  if ($LASTEXITCODE -ne 0) { throw "SCP failed: $local" }
}

# DNS
if (-not $SkipDns) {
  $DnsScript = Join-Path $ScriptDir "dns_squarespace.js"
  if (Test-Path $DnsScript) {
    Write-Host "[dns] Installing Playwright if needed..."
    Push-Location $ScriptDir
    npm install --silent
    Write-Host "[dns] Adding A record $DOMAIN -> $PUBLIC_IP in Squarespace..."
    npx playwright install chromium --with-deps 2>$null
    node dns_squarespace.js
    Pop-Location
    Write-Host "[dns] Waiting 60s for DNS propagation..."
    Start-Sleep -Seconds 60
  } else {
    Write-Host "[dns] Add A record manually in Squarespace: qr-tickets -> $PUBLIC_IP"
    Write-Host "[dns] Press Enter once done..."
    Read-Host
  }
}

# Upload env to server
Write-Host "[env] Uploading env to server..."
Send-File $EnvFile "/tmp/qr_tickets.env"
Invoke-Ssh "chmod 600 /tmp/qr_tickets.env"

# Provision (first-time: nginx vhost + TLS cert)
if (-not $SkipProvision) {
  Write-Host "[provision] Running provision script..."
  Send-File (Join-Path $ScriptDir "provision.sh") "/tmp/qr_provision.sh"
  Invoke-Ssh "chmod +x /tmp/qr_provision.sh && bash /tmp/qr_provision.sh"
}

# Deploy
if (-not $SkipDeploy) {
  Write-Host "[deploy] Running deploy script..."
  Send-File (Join-Path $ScriptDir "deploy.sh") "/tmp/qr_deploy.sh"
  Invoke-Ssh "chmod +x /tmp/qr_deploy.sh && bash /tmp/qr_deploy.sh"
}

Write-Host ""
Write-Host "Deployment complete: https://$DOMAIN"
