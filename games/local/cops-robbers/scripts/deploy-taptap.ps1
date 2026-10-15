param([switch]$PackageOnly, [switch]$DryRun)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
$gamePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$repositoryPath = [IO.Path]::GetFullPath((Join-Path $gamePath '../../..'))
Push-Location $gamePath
try {
    $environmentFile = Join-Path $gamePath '.env'
    if (Test-Path -LiteralPath $environmentFile -PathType Leaf) {
        $configuration = & node "--env-file=$environmentFile" -e "process.stdout.write(JSON.stringify(Object.fromEntries(['TAPTAP_DEVELOPER_ID','TAPTAP_COPS_ROBBERS_APP_ID','TAPTAP_COPS_ROBBERS_AD_UNIT_ID','BROWSER_EXECUTABLE','PLAYWRIGHT_EXECUTABLE_PATH','CHROMIUM_PATH','PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))))"
        if ($LASTEXITCODE -ne 0) { throw 'Cannot load the game .env configuration.' }
        foreach ($property in ($configuration | ConvertFrom-Json).PSObject.Properties) {
            [Environment]::SetEnvironmentVariable($property.Name, [string]$property.Value, 'Process')
        }
    }
    Write-Output 'TapTap target: H5 (dist/index.html). Use H5 package management, not the Tap mini-app ZIP uploader.'
    & node --test scripts/check-ad-core.mjs scripts/check-deploy-config.mjs (Join-Path $repositoryPath 'platforms/h5/tests/platform-ads.test.mjs') (Join-Path $repositoryPath 'platforms/h5/tests/deploy-taptap.test.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'Deployment and advertising checks failed.' }
    & (Join-Path $PSScriptRoot 'package-taptap.ps1')
    if ($LASTEXITCODE -ne 0) { throw 'TapTap H5 packaging failed.' }
    & node scripts/check-taptap-ads.mjs
    if ($LASTEXITCODE -ne 0) { throw 'The exact extracted H5 package failed browser checks.' }
    $zipPath = Join-Path $repositoryPath 'outputs/cops-robbers/cops-robbers-taptap-h5.zip'
    if ($PackageOnly) { Write-Output "TapTap H5 package ready: $zipPath"; return }
    if ([string]::IsNullOrWhiteSpace($env:TAPTAP_DEVELOPER_ID) -or [string]::IsNullOrWhiteSpace($env:TAPTAP_COPS_ROBBERS_APP_ID)) {
        throw 'Package is ready. Fill TAPTAP_DEVELOPER_ID and TAPTAP_COPS_ROBBERS_APP_ID in the game .env (or process environment), then retry; use -PackageOnly for local preparation.'
    }
    & (Join-Path $repositoryPath 'platforms/h5/deploy-taptap.ps1') -ZipPath $zipPath -DeveloperId $env:TAPTAP_DEVELOPER_ID -AppId $env:TAPTAP_COPS_ROBBERS_APP_ID -ScreenOrientation 1 -DryRun:$DryRun
} finally { Pop-Location }
