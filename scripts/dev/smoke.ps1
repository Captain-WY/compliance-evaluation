[CmdletBinding()]
param([switch]$VerifyExisting)
$ErrorActionPreference = 'Stop'
$arguments = @((Join-Path $PSScriptRoot 'smoke.py'))
if ($VerifyExisting) { $arguments += '--verify-existing' }
& python @arguments
if ($LASTEXITCODE -ne 0) { throw 'Basic regression failed. See .local/smoke-results.json or .local/smoke-restart-results.json.' }
