[CmdletBinding()]
param([switch]$DependenciesOnly, [switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& (Join-Path $PSScriptRoot 'bootstrap.ps1')
$compose = @('compose', '--project-name', 'compliance-evaluation-dev', '--env-file', (Join-Path $root 'deploy/local/.env'), '-f', (Join-Path $root 'deploy/local/compose.yaml'))
function Invoke-Compose([string[]]$Arguments) {
    & docker @compose @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed ($LASTEXITCODE): $($Arguments -join ' ')" }
}
Invoke-Compose @('config','--quiet')
Invoke-Compose @('up','-d','--wait','--wait-timeout','240','postgres','redis','minio','casdoor')
Invoke-Compose @('--profile','init','run','--rm','minio-init')
# Only known development subjects are normalized, before application login is enabled.
# PostgreSQL identifiers are quoted because Casdoor uses camelCase column names.
$identitySql = Get-Content (Join-Path $root 'deploy/local/casdoor/normalize-dev-users.sql') -Raw
$localConfig = @{}
Get-Content (Join-Path $root 'deploy/local/.env') | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { $localConfig[$matches[1]] = $matches[2] }
}
$privateClientSecret = $localConfig['CASDOOR_CLIENT_SECRET'].Replace("'", "''")
$operator = Get-Content (Join-Path $root '.local/casdoor-operator.json') -Raw | ConvertFrom-Json
$privateOperatorPassword = $operator.password.Replace("'", "''")
$identitySql += "`nCREATE EXTENSION IF NOT EXISTS pgcrypto; UPDATE ""user"" SET name = 'local_operator', password = crypt('$privateOperatorPassword', gen_salt('bf')), is_forbidden = false WHERE owner = 'built-in' AND name = 'admin';"
$identitySql += "`nUPDATE application SET cert = 'compliance-local-cert', client_secret = '$privateClientSecret' WHERE owner = 'admin' AND name = 'app-built-in';"
$identitySql += "`nDELETE FROM cert WHERE owner = 'admin' AND name = 'cert-built-in';"
$identitySql | & docker @compose exec -T postgres psql -U postgres -d casdoor -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw 'Casdoor development identity initialization failed.' }
if ($DependenciesOnly) { Write-Host 'Dependency services ready.'; return }
if (!$NoBuild) { Invoke-Compose @('build','backend','frontend') }
Invoke-Compose @('--profile','init','run','--rm','migrate')
Invoke-Compose @('up','-d','--wait','--wait-timeout','240','backend','frontend')
Invoke-Compose @('ps')
Write-Host 'Application ready. Addresses and passwords: .local/dev-accounts.md'
