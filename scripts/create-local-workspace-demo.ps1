[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$stage = "reading local Supabase status"

function Invoke-LocalJsonRequest {
  param([string]$Uri,[string]$Method,[hashtable]$Headers,[object]$Body)
  $parameters = @{ Uri=$Uri; Method=$Method; Headers=$Headers; ContentType="application/json"; ErrorAction="Stop" }
  if ($null -ne $Body) { $parameters.Body = $Body | ConvertTo-Json -Depth 6 -Compress }
  Invoke-RestMethod @parameters
}

try {
  $repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
  Push-Location -LiteralPath $repositoryRoot
  try {
    $env:SUPABASE_TELEMETRY_DISABLED = "1"
    $ErrorActionPreference = "Continue"
    $statusOutput = & npx.cmd supabase status --output json 2>&1
    $statusExitCode = $LASTEXITCODE
    $ErrorActionPreference = "Stop"
    if ($statusExitCode -ne 0) { throw "The local Supabase stack is unavailable." }
  } finally { Pop-Location }

  $match = [regex]::Match(($statusOutput -join [Environment]::NewLine), "(?s)\{.*\}")
  if (-not $match.Success) { throw "Local status was invalid." }
  $status = $match.Value | ConvertFrom-Json
  $api = [Uri]([string]$status.API_URL)
  if ($api.Scheme -ne "http" -or $api.Host -notin @("127.0.0.1","localhost") -or $api.IsDefaultPort) {
    throw "Refusing to create a workspace outside local Supabase."
  }

  $trustedKey = [string]$status.SERVICE_ROLE_KEY
  if ([string]::IsNullOrWhiteSpace($trustedKey)) { $trustedKey = [string]$status.SECRET_KEY }
  $browserKey = [string]$status.PUBLISHABLE_KEY
  if ([string]::IsNullOrWhiteSpace($browserKey)) { $browserKey = [string]$status.ANON_KEY }
  if ([string]::IsNullOrWhiteSpace($trustedKey) -or [string]::IsNullOrWhiteSpace($browserKey)) { throw "Local keys were unavailable." }

  $suffix = "{0}-{1}" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(),([Guid]::NewGuid().ToString("N").Substring(0,8))
  $email = "workspace-artist-$suffix@example.test"
  $slug = "workspace-artist-$suffix"
  $bytes = New-Object byte[] 36
  $randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $randomGenerator.GetBytes($bytes) }
  finally { $randomGenerator.Dispose() }
  $password = [Convert]::ToBase64String($bytes)
  $origin = $api.GetLeftPart([System.UriPartial]::Authority)
  $trustedHeaders = @{ apikey=$trustedKey; Authorization="Bearer $trustedKey" }

  $stage = "creating the confirmed local user"
  $user = Invoke-LocalJsonRequest "$origin/auth/v1/admin/users" "POST" $trustedHeaders @{ email=$email; password=$password; email_confirm=$true }
  $accountId = [Guid]::Parse([string]$user.id).ToString()
  $profileId = [Guid]::NewGuid().ToString()
  $safeSlug = $slug.Replace("'","''")
  $sql = @"
insert into public.accounts (id,status,display_name) values ('$accountId'::uuid,'active','LOCAL WORKSPACE ARTIST');
insert into public.account_roles (account_id,role) values ('$accountId'::uuid,'private_member'),('$accountId'::uuid,'artist');
insert into public.public_profiles (id,profile_type,slug,display_name,publication_status,published_at,claim_state,primary_controller_account_id,claimed_at,created_by_account_id)
values ('$profileId'::uuid,'artist','$safeSlug','LOCAL WORKSPACE ARTIST','published',now(),'claimed','$accountId'::uuid,now(),'$accountId'::uuid);
insert into public.profile_members (profile_id,account_id,membership_level,status) values ('$profileId'::uuid,'$accountId'::uuid,'owner','active');
"@
  $stage = "creating the local application workspace"
  $ErrorActionPreference = "Continue"
  $databaseOutput = & docker exec -i supabase_db_CHAINED psql -v ON_ERROR_STOP=1 -U postgres -d postgres -c $sql 2>&1
  $databaseExitCode = $LASTEXITCODE
  $ErrorActionPreference = "Stop"
  $databaseOutput = $null
  if ($databaseExitCode -ne 0) { throw "The local workspace bootstrap failed." }

  $stage = "requesting the local magic link"
  Invoke-LocalJsonRequest "$origin/auth/v1/otp" "POST" @{ apikey=$browserKey } @{
    email=$email
    create_user=$false
    redirect_to="http://127.0.0.1:5500/auth-callback.html"
    gotrue_meta_security=@{}
  } | Out-Null

  Write-Output "Local workspace login: $email"
  Write-Output "Open local Mailpit and use the newest magic-link message."
  Write-Output "Public profile slug: $slug"
}
catch {
  Write-Error "Local workspace demo creation failed while $stage."
  exit 1
}
