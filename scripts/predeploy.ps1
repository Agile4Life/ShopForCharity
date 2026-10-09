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
    Invoke-Check 'node' @('--test', 'deployment/vercel-config.test.mjs')
    Push-Location 'frontend'
    try { Invoke-Check 'npm.cmd' @('run', 'check') } finally { Pop-Location }
    Push-Location 'backend'
    try {
        if ($UnitOnly) {
            Invoke-Check '.\mvnw.cmd' @('-B', '-ntp', 'test')
            Write-Warning 'UnitOnly omits database integration and packaging. This is NOT release validation.'
        } else {
            Invoke-Check '.\mvnw.cmd' @('-B', '-ntp', 'verify')
        }
    } finally { Pop-Location }
} finally { Pop-Location }
