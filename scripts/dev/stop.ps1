[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
& docker compose --project-name compliance-evaluation-dev --env-file (Join-Path $root 'deploy/local/.env') -f (Join-Path $root 'deploy/local/compose.yaml') down --remove-orphans
if ($LASTEXITCODE -ne 0) { throw 'Docker Compose stop failed.' }
Write-Host 'Project stopped. Database, object storage, and Redis volumes retained.'
