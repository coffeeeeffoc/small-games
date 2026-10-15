param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [Parameter(Mandatory = $true)][string]$DeveloperId,
    [Parameter(Mandatory = $true)][string]$AppId,
    [ValidateSet(0, 1)][int]$ScreenOrientation = 1,
    [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
foreach ($id in @($DeveloperId, $AppId)) {
    if ($id -notmatch '^[1-9][0-9]{0,17}$') { throw 'TapTap DeveloperId/AppId must be real positive numeric identifiers.' }
}
$package = Get-Item -LiteralPath $ZipPath
if ($package.PSIsContainer -or $package.Extension -ne '.zip' -or ($package.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'TapTap H5 requires a regular ZIP file.'
}
if (!(Get-Command taptap-cli -ErrorAction SilentlyContinue)) { throw 'Install the official @taptap/cli and run taptap-cli auth login first.' }
$hash = (Get-FileHash -LiteralPath $package.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
$intent = "h5-$DeveloperId-$AppId-$ScreenOrientation-$hash"
$receipt = Join-Path $package.DirectoryName 'taptap-upload.json'
if (!$DryRun -and (Test-Path -LiteralPath $receipt)) {
    $previous = Get-Content -LiteralPath $receipt -Raw | ConvertFrom-Json
    if ($previous.sha256 -eq $hash -and $previous.appId -eq $AppId -and $previous.developerId -eq $DeveloperId -and $previous.screenOrientation -eq $ScreenOrientation -and $previous.uploaded) {
        Write-Output "This exact H5 package already has a successful upload receipt: $receipt"
        return
    }
}
# H5 and Tap mini-app archives use different platform capabilities and upload APIs.
$capabilityResult = & taptap-cli package-management get-available-package-types --dev-id $DeveloperId --app-id $AppId --json
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify TapTap H5 package support. Check CLI authentication, account and app IDs before retrying.' }
$capabilityEnvelope = ($capabilityResult -join "`n") | ConvertFrom-Json
$types = $capabilityEnvelope.data.result.available_package_types
if ($capabilityEnvelope.ok -ne $true -or $capabilityEnvelope.data.status -ne 'completed' -or $types -isnot [array]) {
    throw 'TapTap returned no valid package-type result; no package was uploaded.'
}
if ($types -cnotcontains 'h5') {
    throw "This app does not offer H5 packages (available: $($types -join ', ')). This ZIP contains dist/index.html; it cannot be uploaded as a Tap mini-app package. Confirm an H5 app/channel, or port the game and use the official Tap mini-app packer."
}
Write-Output 'Verified TapTap app package support: H5. Using upload-h5-package.'
# The official CLI confines upload files to cwd; use the verified archive's own directory.
Push-Location $package.DirectoryName
try {
    $arguments = @('upload-h5-package', $package.Name, '--dev-id', $DeveloperId, '--app-id', $AppId,
        '--screen-orientation', "$ScreenOrientation", '--idempotency-key', $intent, '--json')
    if ($DryRun) { $arguments += '--dry-run' } else { $arguments += '--yes' }
    $result = & taptap-cli @arguments
    if ($LASTEXITCODE -ne 0) { throw 'TapTap upload failed. Retry the same archive to preserve its idempotency key.' }
    $envelope = ($result -join "`n") | ConvertFrom-Json
    if ($envelope.ok -ne $true) { throw 'TapTap did not return a successful structured upload result.' }
    $record = [ordered]@{
        packageType = 'h5'
        appId = $AppId; developerId = $DeveloperId; sha256 = $hash; idempotencyKey = $intent
        uploaded = !$DryRun; dryRun = [bool]$DryRun; screenOrientation = $ScreenOrientation
        result = $envelope; reviewSubmitted = $false; onlineVerified = $false; realAdsVerified = $false
    }
    $receipt = Join-Path $package.DirectoryName $(if ($DryRun) { 'taptap-upload-preview.json' } else { 'taptap-upload.json' })
    [IO.File]::WriteAllText($receipt, ($record | ConvertTo-Json -Depth 30) + "`n", [Text.UTF8Encoding]::new($false))
    Write-Output "TapTap H5 $(if ($DryRun) { 'preview' } else { 'upload' }) completed: $receipt"
    Write-Output 'Package upload creates an H5 version; binding, review and online publication remain separate platform steps.'
} finally { Pop-Location }
