[CmdletBinding()]
param(
  [Parameter()] [string]$PdfPath,
  [Parameter()] [switch]$Summary,
  [Parameter()] [switch]$SelfTest,
  [Parameter()] [ValidateRange(256, 12000)] [int]$MaxOutputTokens
)

$ErrorActionPreference = "Stop"
$credentialTarget = "OPENAI_CHAINED_CV_IMPORT"
$hadExistingKey = Test-Path Env:OPENAI_API_KEY
$existingKey = if ($hadExistingKey) { $env:OPENAI_API_KEY } else { $null }

if (-not ("ChainedCredentialManager" -as [type])) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ChainedCredentialManager {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct CREDENTIAL {
    public UInt32 Flags;
    public UInt32 Type;
    public IntPtr TargetName;
    public IntPtr Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public UInt32 CredentialBlobSize;
    public IntPtr CredentialBlob;
    public UInt32 Persist;
    public UInt32 AttributeCount;
    public IntPtr Attributes;
    public IntPtr TargetAlias;
    public IntPtr UserName;
  }
  [DllImport("Advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, UInt32 type, UInt32 flags, out IntPtr credential);
  [DllImport("Advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr credential);
}
"@
}

function Get-GenericCredentialSecret([string]$Target) {
  $pointer = [IntPtr]::Zero
  if (-not [ChainedCredentialManager]::CredRead($Target, 1, 0, [ref]$pointer)) {
    throw "Required Windows Credential Manager credential '$Target' was not found."
  }
  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($pointer, [type][ChainedCredentialManager+CREDENTIAL])
    if ($credential.CredentialBlobSize -eq 0 -or $credential.CredentialBlob -eq [IntPtr]::Zero) {
      throw "Windows Credential Manager credential '$Target' is empty."
    }
    return [Runtime.InteropServices.Marshal]::PtrToStringUni($credential.CredentialBlob, [int]($credential.CredentialBlobSize / 2))
  }
  finally {
    [ChainedCredentialManager]::CredFree($pointer)
  }
}

${exitCode} = 0
try {
  if ($SelfTest) {
    & node -e "process.stdout.write('STDOUT TEST OK\n'); process.stderr.write('STDERR TEST OK\n'); process.exitCode = 7"
  }
  else {
    $secret = Get-GenericCredentialSecret $credentialTarget
    if ([string]::IsNullOrWhiteSpace($secret)) { throw "Windows Credential Manager returned an empty OpenAI credential." }
    $env:OPENAI_API_KEY = $secret
    if ([string]::IsNullOrWhiteSpace($PdfPath)) {
      & node (Join-Path $PSScriptRoot "run-cv-import-luna-smoke.mjs")
    }
    else {
      $arguments = @((Join-Path $PSScriptRoot "run-cv-import-luna-pdf-benchmark.mjs"), "--pdf", $PdfPath)
      if ($Summary) { $arguments += "--summary" }
      if ($PSBoundParameters.ContainsKey("MaxOutputTokens")) { $arguments += @("--max-output-tokens", $MaxOutputTokens) }
      & node @arguments
    }
  }
  ${exitCode} = $LASTEXITCODE
}
finally {
  Remove-Variable secret -ErrorAction SilentlyContinue
  if ($hadExistingKey) { $env:OPENAI_API_KEY = $existingKey }
  else { Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue }
}
exit ${exitCode}
