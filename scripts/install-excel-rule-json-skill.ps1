param(
  [string]$SkillName = "excel-rule-json",
  [string]$SourceRoot = "",
  [string]$DestinationRoot = "",
  [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue)
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-FullPath (Join-Path $scriptDir "..")
if (-not $SourceRoot) {
  $SourceRoot = Join-Path $repoRoot "skills"
}

if (-not $DestinationRoot) {
  if ($env:CODEX_HOME) {
    $DestinationRoot = Join-Path $env:CODEX_HOME "skills"
  } else {
    $DestinationRoot = Join-Path $HOME ".codex\skills"
  }
}

$sourceRootFull = Resolve-FullPath $SourceRoot
$destinationRootFull = Resolve-FullPath $DestinationRoot
$sourceSkill = Resolve-FullPath (Join-Path $sourceRootFull $SkillName)
$destinationSkill = Resolve-FullPath (Join-Path $destinationRootFull $SkillName)

if (-not (Test-Path -LiteralPath $sourceSkill -PathType Container)) {
  throw "Source skill not found: $sourceSkill"
}

$sourceSkillMd = Join-Path $sourceSkill "SKILL.md"
if (-not (Test-Path -LiteralPath $sourceSkillMd -PathType Leaf)) {
  throw "Source skill is missing SKILL.md: $sourceSkillMd"
}

New-Item -ItemType Directory -Force -Path $destinationRootFull | Out-Null

if (Test-Path -LiteralPath $destinationSkill) {
  if (-not $NoBackup) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = Join-Path $destinationRootFull "$SkillName.backup-$timestamp"
    Copy-Item -LiteralPath $destinationSkill -Destination $backupPath -Recurse -Force
    Write-Host "Backed up existing skill to: $backupPath"
  }
  Remove-Item -LiteralPath $destinationSkill -Recurse -Force
}

Copy-Item -LiteralPath $sourceSkill -Destination $destinationSkill -Recurse -Force

Write-Host "Installed skill: $SkillName"
Write-Host "Source: $sourceSkill"
Write-Host "Destination: $destinationSkill"
Write-Host "Restart Codex to pick up new skills."
