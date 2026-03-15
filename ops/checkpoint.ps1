param(
  [Parameter(Mandatory = $true)]
  [string]$Summary,
  [string]$DecisionContext,
  [string]$Decision,
  [string]$DecisionConsequence,
  [switch]$ApiChanged,
  [string]$ApiNote,
  [switch]$DataModelChanged,
  [string]$DataModelNote
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$docsDir = Join-Path $repoRoot "docs"

$sessionNotesPath = Join-Path $docsDir "SESSION_NOTES.md"
$decisionsPath = Join-Path $docsDir "DECISIONS_LOG.md"
$apiPath = Join-Path $docsDir "API_CONTRACT.md"
$dataModelPath = Join-Path $docsDir "DATA_MODEL.md"

$dateOnly = Get-Date -Format "yyyy-MM-dd"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz"

function Ensure-FileExists([string]$path, [string]$fallbackHeader) {
  if (-not (Test-Path $path)) {
    Set-Content -Path $path -Value $fallbackHeader -Encoding utf8
  }
}

function Add-CheckpointBullet([string]$path, [string]$heading, [string]$noteText) {
  $content = Get-Content -Raw -Path $path
  $line = "- ${dateOnly}: $noteText"
  if ($content -match "(?m)^## $([regex]::Escape($heading))\s*$") {
    Add-Content -Path $path -Value "`r`n$line" -Encoding utf8
  } else {
    Add-Content -Path $path -Value "`r`n## $heading`r`n`r`n$line" -Encoding utf8
  }
}

function Next-DecisionId([string]$path) {
  if (-not (Test-Path $path)) {
    return "DEC-001"
  }
  $raw = Get-Content -Raw -Path $path
  $matches = [regex]::Matches($raw, "DEC-(\d+)")
  if ($matches.Count -eq 0) {
    return "DEC-001"
  }
  $max = 0
  foreach ($m in $matches) {
    $n = [int]$m.Groups[1].Value
    if ($n -gt $max) { $max = $n }
  }
  $next = $max + 1
  return ("DEC-{0:D3}" -f $next)
}

function Get-BlockAfterMarker([string]$text, [string]$marker) {
  $idx = $text.IndexOf($marker)
  if ($idx -lt 0) { return "" }
  $start = $idx + $marker.Length
  $rest = $text.Substring($start)
  $m = [regex]::Match($rest, "(\r?\n){2,}")
  if ($m.Success) {
    return $rest.Substring(0, $m.Index)
  }
  return $rest
}

function Get-SectionByHeading([string]$text, [string]$heading) {
  $pattern = "(?ms)^##\s+$([regex]::Escape($heading))\s*$\r?\n(.*?)(?=^##\s+|\z)"
  $m = [regex]::Match($text, $pattern)
  if ($m.Success) { return $m.Groups[1].Value }
  return ""
}

function Get-BacktickedTokens([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return @() }
  $matches = [regex]::Matches($text, "`"([A-Z_]+)`"")
  $tokens = @()
  foreach ($m in $matches) {
    $tokens += $m.Groups[1].Value
  }
  return $tokens | Select-Object -Unique
}

Ensure-FileExists $sessionNotesPath "# Session Notes`r`n"
Ensure-FileExists $decisionsPath "# Decisions Log`r`n"
Ensure-FileExists $apiPath "# API Contract`r`n"
Ensure-FileExists $dataModelPath "# Data Model`r`n"

Add-Content -Path $sessionNotesPath -Encoding utf8 -Value @"

## $dateOnly (Checkpoint)
- [$timestamp] $Summary
"@

if ($ApiChanged) {
  $apiUpdate = if ([string]::IsNullOrWhiteSpace($ApiNote)) { "API/interface changed in checkpoint." } else { $ApiNote }
  Add-CheckpointBullet -path $apiPath -heading "Checkpoint Updates" -noteText $apiUpdate
}

if ($DataModelChanged) {
  $modelUpdate = if ([string]::IsNullOrWhiteSpace($DataModelNote)) { "Data model/schema changed in checkpoint." } else { $DataModelNote }
  Add-CheckpointBullet -path $dataModelPath -heading "Checkpoint Updates" -noteText $modelUpdate
}

if (
  -not [string]::IsNullOrWhiteSpace($DecisionContext) -and
  -not [string]::IsNullOrWhiteSpace($Decision) -and
  -not [string]::IsNullOrWhiteSpace($DecisionConsequence)
) {
  $decisionId = Next-DecisionId -path $decisionsPath
  Add-Content -Path $decisionsPath -Encoding utf8 -Value @"

## $decisionId ($dateOnly)
- Context: $DecisionContext
- Decision: $Decision
- Consequence: $DecisionConsequence
"@
}

$apiRaw = Get-Content -Raw -Path $apiPath
$dataRaw = Get-Content -Raw -Path $dataModelPath

$apiStatusBlock = Get-BlockAfterMarker -text $apiRaw -marker "Ticket request statuses:"
$dataTicketRequestSection = Get-SectionByHeading -text $dataRaw -heading "TicketRequest"
$dataStatusLine = [regex]::Match($dataTicketRequestSection, "(?m)^- `status`:\s+.*$").Value

$apiStatuses = Get-BacktickedTokens -text $apiStatusBlock
$dataStatuses = Get-BacktickedTokens -text $dataStatusLine

$apiMissingStatuses = @($dataStatuses | Where-Object { $_ -notin $apiStatuses })
$dataMissingStatuses = @($apiStatuses | Where-Object { $_ -notin $dataStatuses })

if ($apiMissingStatuses.Count -gt 0 -or $dataMissingStatuses.Count -gt 0) {
  Write-Warning ("Doc enum mismatch for TicketRequest statuses. API-only: [{0}] DataModel-only: [{1}]" -f (($dataMissingStatuses -join ", ")), (($apiMissingStatuses -join ", ")))
}

Write-Host "Checkpoint completed."
Write-Host "Updated:"
Write-Host " - $sessionNotesPath"
if ($ApiChanged) { Write-Host " - $apiPath" }
if ($DataModelChanged) { Write-Host " - $dataModelPath" }
if (
  -not [string]::IsNullOrWhiteSpace($DecisionContext) -and
  -not [string]::IsNullOrWhiteSpace($Decision) -and
  -not [string]::IsNullOrWhiteSpace($DecisionConsequence)
) { Write-Host " - $decisionsPath" }
