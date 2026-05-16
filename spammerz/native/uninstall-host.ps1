$ErrorActionPreference = "Stop"

$HostName = "com.zheys.spammerz.updater"
$RegistryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
$ManifestPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "$HostName.json"

if (Test-Path -LiteralPath $RegistryPath) {
  Remove-Item -LiteralPath $RegistryPath -Recurse -Force
}

if (Test-Path -LiteralPath $ManifestPath) {
  Remove-Item -LiteralPath $ManifestPath -Force
}

Write-Host "SpammerZ native updater uninstalled."
