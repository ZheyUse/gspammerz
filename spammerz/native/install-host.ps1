param(
  [Parameter(Mandatory = $false)]
  [string]$ExtensionId
)

$ErrorActionPreference = "Stop"

if (-not $ExtensionId) {
  $ExtensionId = Read-Host "Paste the SpammerZ extension ID from chrome://extensions"
}

$ExtensionId = $ExtensionId.Trim()
if ($ExtensionId -notmatch "^[a-p]{32}$") {
  throw "Invalid Chrome extension ID: $ExtensionId"
}

$HostName = "com.zheys.spammerz.updater"
$NativeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$HostCmd = Join-Path $NativeDir "spammerz-native-host.cmd"
$ManifestPath = Join-Path $NativeDir "$HostName.json"

if (-not (Test-Path -LiteralPath $HostCmd)) {
  throw "Native host command was not found: $HostCmd"
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found on PATH. Install Node.js or add node.exe to PATH before installing the native updater."
}

$Manifest = [ordered]@{
  name = $HostName
  description = "SpammerZ native updater"
  path = $HostCmd
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$Manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
New-Item -Path $RegistryPath -Force | Out-Null
Set-Item -Path $RegistryPath -Value $ManifestPath

Write-Host "SpammerZ native updater installed."
Write-Host "Host: $HostName"
Write-Host "Manifest: $ManifestPath"
Write-Host "Allowed extension: $ExtensionId"
