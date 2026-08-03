[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

function Stop-WithSafeMessage {
  param([string]$Message)
  throw $Message
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
      Stop-WithSafeMessage "The local Supabase stack is not available."
    }
  }
  finally {
    Pop-Location
  }

  $statusText = $statusOutput -join [Environment]::NewLine
  $statusMatch = [regex]::Match($statusText, "(?s)\{.*\}")
  if (-not $statusMatch.Success) {
    Stop-WithSafeMessage "Local Supabase status did not return valid JSON."
  }
  $status = $statusMatch.Value | ConvertFrom-Json
  $apiUrl = [Uri]([string]$status.API_URL)

  if (
    $apiUrl.Scheme -ne "http" -or
    $apiUrl.Host -notin @("127.0.0.1", "localhost") -or
    $apiUrl.IsDefaultPort
  ) {
    Stop-WithSafeMessage "Refusing to create frontend configuration for a non-local API."
  }

  $browserKey = [string]$status.PUBLISHABLE_KEY
  if ([string]::IsNullOrWhiteSpace($browserKey)) {
    $browserKey = [string]$status.ANON_KEY
  }

  if (
    [string]::IsNullOrWhiteSpace($browserKey) -or
    $browserKey -match "^sb_secret_" -or
    $browserKey -match "service[_-]?role"
  ) {
    Stop-WithSafeMessage "A browser-safe local Supabase key was not available."
  }

  $apiJson = $apiUrl.GetLeftPart([System.UriPartial]::Authority) |
    ConvertTo-Json -Compress
  $keyJson = $browserKey | ConvertTo-Json -Compress
  $callbackJson = "http://127.0.0.1:5500/auth-callback.html" |
    ConvertTo-Json -Compress

  $configuration = @"
// Generated for the local Supabase stack. This file is intentionally untracked.
export default Object.freeze({
  mode: "local-supabase",
  supabaseUrl: $apiJson,
  supabaseKey: $keyJson,
  callbackUrl: $callbackJson
});
"@

  $destination = Join-Path -Path $repositoryRoot -ChildPath "frontend-config.local.mjs"
  [System.IO.File]::WriteAllText(
    $destination,
    $configuration,
    [System.Text.UTF8Encoding]::new($false)
  )

  Write-Output "Local frontend configuration written successfully."
}
catch {
  Write-Error $_.Exception.Message
  exit 1
}
