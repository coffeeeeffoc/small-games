param([switch]$Release, [switch]$Check, [string]$Config)
$ErrorActionPreference = 'Stop'
$previousConfig = $env:WULONG_ANDROID_CONFIG
try {
    if ($Config) { $env:WULONG_ANDROID_CONFIG = (Resolve-Path -LiteralPath $Config).Path }
    $arguments = @((Join-Path $PSScriptRoot 'build-android.mjs'))
    if ($Release) { $arguments += '--release' }
    if ($Check) { $arguments += '--check' }
    & node @arguments
    if ($LASTEXITCODE -ne 0) { throw "Android packaging failed (exit $LASTEXITCODE)" }
} finally {
    $env:WULONG_ANDROID_CONFIG = $previousConfig
}
