# QR Tickets — Deployment Orchestrator
# Usage: .\master.ps1 [-SkipDns] [-SkipProvision] [-SkipDeploy]
param(
  [switch]$SkipDns,
  [switch]$SkipProvision,
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# ─── Load .env ────────────────────────────────────────────────────────────────
$EnvFile = Join-Path $ScriptDir ".env"
if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile — copy from .env.example and fill in values."
  exit 1
}

$envVars = @{}
Get-Content $EnvFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#")) {
    $parts = $line -split "=", 2
    if ($parts.Length -eq 2) {
      $key = $parts[0].Trim()
      $val = $parts[1].Trim().Trim('"')
      $envVars[$key] = $val
      [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
    }
  }
}

$SSH_HOST  = $envVars["SSH_HOST"]
$SSH_PORT  = $envVars["SSH_PORT"]
$SSH_USER  = $envVars["SSH_USER"]
$SSH_KEY   = $envVars["SSH_KEY_PATH"]
$DOMAIN    = $envVars["DOMAIN"]
$ROOT_DOMAIN = $envVars["ROOT_DOMAIN"]
$PUBLIC_IP = $envVars["PUBLIC_IP"]

$SshTarget = "${SSH_USER}@${SSH_HOST}"
$SshOpts   = "-i `"$SSH_KEY`" -p $SSH_PORT -o StrictHostKeyChecking=no -o BatchMode=yes"

function Invoke-Ssh($cmd) {
  $full = "ssh $SshOpts $SshTarget `"$cmd`""
  Write-Host "[ssh] $cmd"
  Invoke-Expression $full
  if ($LASTEXITCODE -ne 0) { throw "SSH command failed: $cmd" }
}

function Send-File($local, $remote) {
  $full = "scp $SshOpts `"$local`" `"${SshTarget}:${remote}`""
  Write-Host "[scp] $local -> $remote"
  Invoke-Expression $full
  if ($LASTEXITCODE -ne 0) { throw "SCP failed: $local" }
}

# ─── DNS ──────────────────────────────────────────────────────────────────────
if (-not $SkipDns) {
  Write-Host "[dns] Adding A record $DOMAIN -> $PUBLIC_IP in Squarespace..."
  $DnsScript = Join-Path $ScriptDir "dns_squarespace.js"
  if (Test-Path $DnsScript) {
    node $DnsScript --host "qr-tickets" --ip $PUBLIC_IP
    Write-Host "[dns] Waiting 30s for DNS propagation..."
    Start-Sleep -Seconds 30
  } else {
    Write-Host "[dns] dns_squarespace.js not found — add A record manually: qr-tickets -> $PUBLIC_IP"
    Write-Host "[dns] Press Enter once the DNS record is saved..."
    Read-Host
  }
}

# ─── Upload env ───────────────────────────────────────────────────────────────
Write-Host "[env] Uploading automation env to server..."
Send-File $EnvFile "/tmp/qr_tickets.env"
Invoke-Ssh "chmod 600 /tmp/qr_tickets.env"

# ─── Provision (first-time only) ─────────────────────────────────────────────
if (-not $SkipProvision) {
  Write-Host "[provision] Running provision script..."
  Send-File (Join-Path $ScriptDir "provision.sh") "/tmp/qr_provision.sh"
  Invoke-Ssh "chmod +x /tmp/qr_provision.sh && /tmp/qr_provision.sh"
}

# ─── Deploy ───────────────────────────────────────────────────────────────────
if (-not $SkipDeploy) {
  Write-Host "[deploy] Running deploy script..."
  Send-File (Join-Path $ScriptDir "deploy.sh") "/tmp/qr_deploy.sh"
  Invoke-Ssh "chmod +x /tmp/qr_deploy.sh && /tmp/qr_deploy.sh"
}

Write-Host ""
Write-Host "Deployment complete: https://$DOMAIN"
