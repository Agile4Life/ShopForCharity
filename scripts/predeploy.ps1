param([switch]$UnitOnly)
$ErrorActionPreference = 'Stop'
$repoPath = Split-Path $PSScriptRoot -Parent
function Invoke-Check {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Check failed: $Command $($Arguments -join ' ')" }
}
Push-Location $repoPath
try {
    Invoke-Check 'npm.cmd' @('test')
    Push-Location 'frontend'
    try {
        Invoke-Check 'npm.cmd' @('run', 'build')
        if (-not $UnitOnly) { Invoke-Check 'npm.cmd' @('run', 'check') }
    } finally { Pop-Location }
    if ($UnitOnly) { Write-Warning 'Browser E2E and live Vercel checks were not run.' }
} finally { Pop-Location }
