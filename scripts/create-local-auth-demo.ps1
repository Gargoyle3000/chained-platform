[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$stage = "reading local Supabase status"

function Invoke-LocalJsonRequest {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [string]$Method,
    [Parameter(Mandatory)] [hashtable]$Headers,
    [Parameter()] [object]$Body
  )

  $parameters = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    ContentType = "application/json"
    ErrorAction = "Stop"
  }
  if ($null -ne $Body) {
    $parameters.Body = $Body | ConvertTo-Json -Depth 8 -Compress
  }
  Invoke-RestMethod @parameters
}

try {
  $repositoryRoot = [System.IO.Path]::GetFullPath(
    (Join-Path -Path $PSScriptRoot -ChildPath "..")
  )

  Push-Location -LiteralPath $repositoryRoot
  try {
    $env:SUPABASE_TELEMETRY_DISABLED = "1"
    $ErrorActionPreference = "Continue"
    $statusOutput = & npx.cmd supabase status --output json 2>&1
    $statusExitCode = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($statusExitCode -ne 0) {
      throw "The local Supabase stack is not available."
    }
  }
  finally {
    Pop-Location
  }

  $statusText = $statusOutput -join [Environment]::NewLine
  $statusMatch = [regex]::Match($statusText, "(?s)\{.*\}")
  if (-not $statusMatch.Success) {
    throw "Local Supabase status did not return valid JSON."
  }
  $status = $statusMatch.Value | ConvertFrom-Json
  $stage = "validating the local Supabase environment"
  $api = [Uri]([string]$status.API_URL)
  if (
    $api.Scheme -ne "http" -or
    $api.Host -notin @("127.0.0.1", "localhost") -or
    $api.IsDefaultPort
  ) {
    throw "Refusing to create demo identities outside the local Supabase stack."
  }

  $serviceCredential = [string]$status.SERVICE_ROLE_KEY
  if ([string]::IsNullOrWhiteSpace($serviceCredential)) {
    $serviceCredential = [string]$status.SECRET_KEY
  }
  $publishableKey = [string]$status.PUBLISHABLE_KEY
  if ([string]::IsNullOrWhiteSpace($publishableKey)) {
    $publishableKey = [string]$status.ANON_KEY
  }
  if (
    [string]::IsNullOrWhiteSpace($serviceCredential) -or
    [string]::IsNullOrWhiteSpace($publishableKey)
  ) {
    throw "Required local credentials were not available."
  }

  $suffix = "{0}-{1}" -f ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()),
    ([Guid]::NewGuid().ToString("N").Substring(0, 8))
  $adminEmail = "temporary-admin-$suffix@example.test"
  $artistEmail = "invited-artist-$suffix@example.test"
  $randomBytes = New-Object byte[] 36
  $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $randomGenerator.GetBytes($randomBytes)
  }
  finally {
    $randomGenerator.Dispose()
  }
  $adminPassword = [Convert]::ToBase64String($randomBytes)

  $trustedHeaders = @{
    apikey = $serviceCredential
    Authorization = "Bearer $serviceCredential"
  }

  $adminRequest = @{
    Uri = "$($api.GetLeftPart([System.UriPartial]::Authority))/auth/v1/admin/users"
    Method = "POST"
    Headers = $trustedHeaders
    Body = @{
      email = $adminEmail
      password = $adminPassword
      email_confirm = $true
    }
  }
  $stage = "creating the temporary local admin"
  $adminUser = Invoke-LocalJsonRequest @adminRequest
  $adminId = [string]$adminUser.id
  if ([string]::IsNullOrWhiteSpace($adminId)) {
    $adminId = [string]$adminUser.user.id
  }
  if ([string]::IsNullOrWhiteSpace($adminId)) {
    throw "The local Auth admin response was invalid."
  }

  $validatedAdminId = [Guid]::Parse($adminId).ToString()
  $bootstrapSql = @"
insert into public.accounts (id, status, display_name)
values ('$validatedAdminId'::uuid, 'active', 'Temporary local administrator');
insert into public.account_roles (account_id, role)
values ('$validatedAdminId'::uuid, 'admin');
"@

  $stage = "creating the temporary application admin"
  $ErrorActionPreference = "Continue"
  $bootstrapOutput = & docker exec -i supabase_db_CHAINED psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c $bootstrapSql 2>&1
  $bootstrapExitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  if ($bootstrapExitCode -ne 0) {
    throw "The trusted local database bootstrap failed."
  }
  $bootstrapOutput = $null

  $sessionRequest = @{
    Uri = "$($api.GetLeftPart([System.UriPartial]::Authority))/auth/v1/token?grant_type=password"
    Method = "POST"
    Headers = @{ apikey = $publishableKey }
    Body = @{
      email = $adminEmail
      password = $adminPassword
    }
  }
  $stage = "obtaining the temporary admin session"
  $session = Invoke-LocalJsonRequest @sessionRequest

  $invitationRequest = @{
    Uri = "$($api.GetLeftPart([System.UriPartial]::Authority))/functions/v1/invite-account"
    Method = "POST"
    Headers = @{
      apikey = $publishableKey
      Authorization = "Bearer $([string]$session.access_token)"
    }
    Body = @{
      email = $artistEmail
      roles = @("artist")
    }
  }
  $stage = "calling the local invite-account function"
  Invoke-LocalJsonRequest @invitationRequest | Out-Null

  Write-Output "Invited local artist: $artistEmail"
  Write-Output "Open local Mailpit to accept the invitation."
  Write-Output "Cleanup: npx supabase db reset --local"
}
catch {
  Write-Error "Local authentication demo creation failed while $stage."
  exit 1
}
