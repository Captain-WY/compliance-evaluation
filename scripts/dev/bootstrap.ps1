[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$envPath = Join-Path $root 'deploy/local/.env'
$localPath = Join-Path $root '.local'
New-Item -ItemType Directory -Force $localPath | Out-Null
function Write-Utf8([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"), (New-Object Text.UTF8Encoding($false)))
}
function New-Secret {
    $bytes = New-Object byte[] 24
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$script:reservedPorts = @()
function Find-Port([int]$Preferred) {
    for ($p = $Preferred; $p -lt ($Preferred + 100); $p++) {
        if ($script:reservedPorts -contains $p) { continue }
        $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
        try { $listener.Start(); $script:reservedPorts += $p; return $p } catch {} finally { $listener.Stop() }
    }
    throw "No available loopback port near $Preferred"
}
if (Test-Path $envPath) {
    if (!(Test-Path (Join-Path $localPath 'casdoor-init.json'))) { throw 'Existing .env but missing .local/casdoor-init.json. Restore local credentials; refusing to rotate them.' }
    Write-Host 'Existing local configuration retained.'
    return
}
$values = [ordered]@{
    COMPOSE_PROJECT_NAME = 'compliance-evaluation-dev'
    FRONTEND_PORT = Find-Port 3010
    BACKEND_PORT = Find-Port 8010
    CASDOOR_PORT = Find-Port 8000
    MINIO_API_PORT = Find-Port 9000
    MINIO_CONSOLE_PORT = Find-Port 9001
    POSTGRES_PASSWORD = New-Secret
    COMMON_DB_PASSWORD = New-Secret
    CASE_DB_PASSWORD = New-Secret
    COMPLIANCE_DB_PASSWORD = New-Secret
    CASDOOR_DB_PASSWORD = New-Secret
    MINIO_ACCESS_KEY = 'compliance-local'
    MINIO_SECRET_KEY = New-Secret
    MINIO_BUCKET = 'compliance-files'
    CASDOOR_ORGANIZATION = 'compliance'
    CASDOOR_APPLICATION = 'compliance-evaluation'
    CASDOOR_CLIENT_ID = 'compliance-local-app'
    CASDOOR_CLIENT_SECRET = New-Secret
    PYTHON_IMAGE = 'public.ecr.aws/docker/library/python:3.12-slim'
    NGINX_IMAGE = 'public.ecr.aws/docker/library/nginx:1.28-alpine'
    CASDOOR_IMAGE = 'registry.hub.docker.com/casbin/casdoor@sha256:758bb52a59dc4bf47c38956230353a213ac485c34f672e020daf2deca1e98e63'
}
$values.CASDOOR_PUBLIC_ENDPOINT = "http://localhost:$($values.CASDOOR_PORT)"
$values.MINIO_PUBLIC_ENDPOINT = "localhost:$($values.MINIO_API_PORT)"
$values.CORS_ALLOW_ORIGINS = "http://localhost:$($values.FRONTEND_PORT)"
$roles = @('platform_admin','hq_business','branch_business','department_business','external_lawyer')
$names = @('admin','hq_user','branch_user','department_user','lawyer')
$ids = @('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555')
$users = @()
$roleData = @()
$accountLines = @('# Local development accounts','','Generated once; keep this ignored file private.','','| Username | Role | Password |','|---|---|---|')
for ($i = 0; $i -lt $names.Count; $i++) {
    $password = New-Secret
    $users += @{ owner='compliance'; name=$names[$i]; id=$ids[$i]; type='normal-user'; password=$password; displayName=$names[$i]; email="$($names[$i])@example.test"; isAdmin=$false; signupApplication='compliance-evaluation'; properties=@{} }
    $roleData += @{ owner='admin'; name=$roles[$i]; displayName=$roles[$i]; isEnabled=$true; users=@("compliance/$($names[$i])"); roles=@() }
    $accountLines += "| $($names[$i]) | $($roles[$i]) | $password |"
}
$operatorPassword = New-Secret
$accountLines += "| local_operator (Casdoor built-in organization only) | Casdoor operator | $operatorPassword |"
$init = @{
    organizations = @(@{ owner='admin'; name='compliance'; displayName='Compliance development'; passwordType='bcrypt'; passwordOptions=@('AtLeast6'); defaultApplication='compliance-evaluation'; defaultTokenFormat='JWT'; defaultTokenFields=@(); languages=@('zh','en'); countryCodes=@('CN'); accountItems=@() })
    applications = @(@{ owner='admin'; name='compliance-evaluation'; displayName='Compliance Evaluation'; organization='compliance'; cert='compliance-local-cert'; enablePassword=$true; enableSignUp=$false; clientId=$values.CASDOOR_CLIENT_ID; clientSecret=$values.CASDOOR_CLIENT_SECRET; providers=@(); signinMethods=@(@{name='Password';displayName='Password';rule='All'}); grantTypes=@('authorization_code','password'); redirectUris=@("http://localhost:$($values.FRONTEND_PORT)/callback"); tokenFormat='JWT'; tokenFields=@(); expireInHours=8; signupItems=@(); homepageUrl="http://localhost:$($values.FRONTEND_PORT)" })
    users = $users
    roles = $roleData
    certs = @(@{ owner='admin'; name='compliance-local-cert'; displayName='Local JWT signing certificate'; scope='JWT'; type='x509'; cryptoAlgorithm='RS256'; bitSize=2048; expireInYears=10 })
}
Write-Utf8 (Join-Path $localPath 'casdoor-init.json') ($init | ConvertTo-Json -Depth 15)
Write-Utf8 (Join-Path $localPath 'casdoor-operator.json') (@{ username='local_operator'; password=$operatorPassword } | ConvertTo-Json)
Write-Utf8 (Join-Path $localPath 'dev-accounts.json') (@($users | Where-Object owner -eq 'compliance' | ForEach-Object { @{ username=$_.name; password=$_.password; role=$roles[[Array]::IndexOf($names, $_.name)] } }) | ConvertTo-Json -Depth 4)
Write-Utf8 (Join-Path $localPath 'dev-accounts.md') (($accountLines + @('',"Frontend: http://localhost:$($values.FRONTEND_PORT)","API: http://localhost:$($values.BACKEND_PORT)","Casdoor: $($values.CASDOOR_PUBLIC_ENDPOINT)","MinIO console: http://localhost:$($values.MINIO_CONSOLE_PORT)","MinIO S3: http://localhost:$($values.MINIO_API_PORT)")) -join "`n")
Write-Utf8 $envPath (($values.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`n")
Write-Host 'Local secrets generated in deploy/local/.env and .local/dev-accounts.md.'
