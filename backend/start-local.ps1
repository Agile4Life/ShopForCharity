$ErrorActionPreference = 'Stop'
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Missing backend/.env. Copy .env.example and configure it first.'
}
Get-Content -LiteralPath $envPath | ForEach-Object {
    if ($_ -match '^([A-Z_]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
    }
}
Push-Location $PSScriptRoot
try {
    if (Get-Command mvn.cmd -ErrorAction SilentlyContinue) {
        & mvn.cmd -B -ntp spring-boot:run
    } else {
        & .\mvnw.cmd spring-boot:run
    }
    if ($LASTEXITCODE -ne 0) { throw "Backend exited with code $LASTEXITCODE." }
} finally {
    Pop-Location
}
