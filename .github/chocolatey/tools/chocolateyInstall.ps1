# GoPost Chocolatey Install Script
#
# Downloads the latest Windows CLI binary from GitHub Releases
# and installs it to the Chocolatey bin directory.

$ErrorActionPreference = 'Stop'

$packageName = 'gopost'
$url64 = 'https://github.com/berksunduri/GOPost/releases/latest/download/gopost-windows-amd64.zip'

$packageArgs = @{
  packageName   = $packageName
  unzipLocation = "$(Split-Path -Parent $MyInvocation.MyCommand.Definition)"
  url64bit      = $url64
  checksum64    = '__CHECKSUM__'
  checksumType64 = 'sha256'
}

Install-ChocolateyZipPackage @packageArgs

# Add to PATH via shim
$installDir = "$(Split-Path -Parent $MyInvocation.MyCommand.Definition)"
Install-BinFile -Name 'gopost' -Path "$installDir\gopost.exe"

Write-Host "GoPost CLI installed. Run 'gopost --version' to verify."
