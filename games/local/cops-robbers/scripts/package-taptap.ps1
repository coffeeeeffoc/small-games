$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$gamePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location $gamePath
try {
    & node scripts/build.mjs --taptap
    if ($LASTEXITCODE -ne 0) { throw 'H5 build failed' }
    $distPath = Join-Path $gamePath 'dist'
    $outputPath = [IO.Path]::GetFullPath((Join-Path $gamePath '../../../outputs/cops-robbers'))
    [IO.Directory]::CreateDirectory($outputPath) | Out-Null
    $zipPath = Join-Path $outputPath 'cops-robbers-taptap-h5.zip'
    $temporaryPath = Join-Path $outputPath ([Guid]::NewGuid().ToString() + '.zip')
    # The ordinary build preserves old files. Package only this build's current sources.
    $names = @('index.html', 'dev-mode.js', 'publishing.js', 'platform-ads.js', 'platform-config.js', 'favicon.svg')
    foreach ($directory in @('src', 'assets')) {
        foreach ($item in (Get-ChildItem -LiteralPath (Join-Path $gamePath $directory) -Recurse -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink in H5 sources' }
            if ($item.PSIsContainer) { continue }
            $name = $item.FullName.Substring($gamePath.Length + 1).Replace('\', '/')
            if ($name -notmatch '^(src/[a-z0-9-]+\.(js|css)|assets/[a-z0-9-]+\.(svg|webp))$') {
                throw "Unexpected H5 source: $name"
            }
            $names += $name
        }
    }
    $inventory = @()
    foreach ($name in ($names | Sort-Object)) {
        $file = Get-Item -LiteralPath (Join-Path $distPath $name)
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink in H5 build' }
        $inventory += [ordered]@{ path = $name; bytes = $file.Length; sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
    try {
        $archive = [IO.Compression.ZipFile]::Open($temporaryPath, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($file in $inventory) {
                $entry = $archive.CreateEntry(('dist/' + $file.path), [IO.Compression.CompressionLevel]::Optimal)
                # Rebuilding identical content must retain the upload idempotency key.
                $entry.LastWriteTime = [DateTimeOffset]::Parse('2000-01-01T00:00:00Z')
                $inputStream = [IO.File]::OpenRead((Join-Path $distPath $file.path))
                try {
                    $entryStream = $entry.Open()
                    try { $inputStream.CopyTo($entryStream) } finally { $entryStream.Dispose() }
                } finally { $inputStream.Dispose() }
            }
        } finally { $archive.Dispose() }
        $archive = [IO.Compression.ZipFile]::OpenRead($temporaryPath)
        try {
            if ($archive.Entries.Count -ne $inventory.Count) { throw 'ZIP file count mismatch' }
            foreach ($file in $inventory) {
                $matches = @($archive.Entries | Where-Object { $_.FullName -ceq ('dist/' + $file.path) })
                if ($matches.Count -ne 1 -or $matches[0].Length -ne $file.bytes) { throw "ZIP entry mismatch: $($file.path)" }
                if ($matches[0].LastWriteTime.DateTime -ne [DateTime]::Parse('2000-01-01T00:00:00')) { throw 'Non-deterministic ZIP timestamp' }
                $stream = $matches[0].Open()
                try {
                    if ((Get-FileHash -InputStream $stream -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "ZIP content mismatch: $($file.path)" }
                } finally { $stream.Dispose() }
            }
        } finally { $archive.Dispose() }
        $extractPath = [IO.Path]::GetFullPath((Join-Path $outputPath 'taptap-h5'))
        if (!$extractPath.StartsWith($outputPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Extraction path escapes output' }
        if (Test-Path -LiteralPath $extractPath) {
            $existing = Get-Item -LiteralPath $extractPath -Force
            if (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Resolve-Path -LiteralPath $extractPath).Path -ne $extractPath) { throw 'Unsafe extraction directory' }
            Remove-Item -LiteralPath $extractPath -Recurse -Force
        }
        [IO.Compression.ZipFile]::ExtractToDirectory($temporaryPath, $extractPath)
        $report = [ordered]@{
            packageType = 'h5'; uploadCommand = 'upload-h5-package'
            format = 'TapTap H5 static ZIP'; entry = 'dist/index.html'; buildDirectory = 'games/local/cops-robbers/dist'; uploadDirectory = 'outputs/cops-robbers/taptap-h5/dist'; screenOrientation = 1
            bytes = (Get-Item -LiteralPath $temporaryPath).Length
            sha256 = (Get-FileHash -LiteralPath $temporaryPath -Algorithm SHA256).Hash.ToLowerInvariant()
            files = $inventory; zipMatchesCurrentBuild = $true; competitionEnabled = $false
            deterministicEntryTimestamps = $true
            adMode = 'host'; adPlatform = 'taptap-h5'; adUnitConfigured = ![string]::IsNullOrWhiteSpace($env:TAPTAP_COPS_ROBBERS_AD_UNIT_ID)
            uploaded = $false; reviewApproved = $false; realDeviceVerified = $false; realAdsVerified = $false
        }
        Move-Item -LiteralPath $temporaryPath -Destination $zipPath -Force
        $reportDirectory = Join-Path $gamePath 'docs/qa'
        [IO.Directory]::CreateDirectory($reportDirectory) | Out-Null
        [IO.File]::WriteAllText((Join-Path $reportDirectory 'taptap-h5-package.json'), ($report | ConvertTo-Json -Depth 8) + "`n", [Text.UTF8Encoding]::new($false))
        Write-Output "Verified $($inventory.Count) resources: $zipPath"
        Write-Output 'Package type: H5. This archive is not a Tap mini-app package; use upload-h5-package or the H5 package entry.'
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
    }
} finally { Pop-Location }
