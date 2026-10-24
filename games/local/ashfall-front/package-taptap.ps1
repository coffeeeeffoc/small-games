$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1')
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

# Windows packaging uses .NET ZIP; the game build itself remains platform independent.
Push-Location $PSScriptRoot
try {
    & node scripts/build.mjs web-mobile
    if ($LASTEXITCODE -ne 0) { throw 'H5 build failed' }
    & node scripts/verify-artifact.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Creator artifact verification failed' }
    $distPath = Join-Path $PSScriptRoot 'dist'
    $outputPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../../outputs/ashfall-front'))
    [IO.Directory]::CreateDirectory($outputPath) | Out-Null
    $zipPath = Join-Path $outputPath 'ashfall-front-taptap-h5.zip'
    $temporaryPath = Join-Path $outputPath ([Guid]::NewGuid().ToString() + '.zip')
    $inventory = @()
    foreach ($item in (Get-ChildItem -LiteralPath $distPath -Recurse -Force | Sort-Object FullName)) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink in H5 build' }
        if ($item.PSIsContainer) { continue }
        $relativePath = $item.FullName.Substring($distPath.Length + 1).Replace('\', '/')
        if ($relativePath -match '(^|/)\.\.?(/|$)' -or $relativePath -notmatch '\.(html|css|js|json|png|jpg|jpeg|webp|gif|svg|wasm|ttf|woff2?|mp3|wav|ogg|bin|ico)$') {
            throw "Unexpected H5 resource: $relativePath"
        }
        $inventory += [ordered]@{
            path = $relativePath
            bytes = $item.Length
            sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
    }
    if ('index.html' -notin $inventory.path) { throw 'Missing H5 entry' }
    try {
        # Match the official H5 uploader: one alphanumeric top-level folder, then index.html.
        $archive = [IO.Compression.ZipFile]::Open($temporaryPath, [IO.Compression.ZipArchiveMode]::Create)
        try {
            foreach ($file in $inventory) {
                [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $distPath $file.path), ('dist/' + $file.path), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
            }
        } finally { $archive.Dispose() }
        $archive = [IO.Compression.ZipFile]::OpenRead($temporaryPath)
        try {
            $entries = @($archive.Entries | Where-Object { $_.Name })
            if ($entries.Count -ne $inventory.Count) { throw 'H5 ZIP file count mismatch' }
            foreach ($file in $inventory) {
                $entryPath = 'dist/' + $file.path
                $matches = @($entries | Where-Object { $_.FullName -ceq $entryPath })
                if ($matches.Count -ne 1 -or $matches[0].Length -ne $file.bytes) {
                    throw "H5 ZIP entry mismatch: $entryPath"
                }
                $stream = $matches[0].Open()
                try {
                    $sha = (Get-FileHash -InputStream $stream -Algorithm SHA256).Hash.ToLowerInvariant()
                    if ($sha -ne $file.sha256) { throw "H5 ZIP content mismatch: $entryPath" }
                } finally { $stream.Dispose() }
            }
        } finally { $archive.Dispose() }
        $package = [ordered]@{
            format = 'TapTap H5 static ZIP'
            entry = 'dist/index.html'
            uploadDirectory = 'games/local/ashfall-front/dist'
            screenOrientation = 2
            bytes = (Get-Item -LiteralPath $temporaryPath).Length
            sha256 = (Get-FileHash -LiteralPath $temporaryPath -Algorithm SHA256).Hash.ToLowerInvariant()
            files = $inventory
            zipMatchesDist = $true
            uploaded = $false
            reviewApproved = $false
            realDeviceVerified = $false
        }
        Move-Item -LiteralPath $temporaryPath -Destination $zipPath -Force
        $reportPath = Join-Path $PSScriptRoot 'docs/qa/taptap-h5-package.json'
        [IO.File]::WriteAllText($reportPath, ($package | ConvertTo-Json -Depth 8) + "`n", [Text.UTF8Encoding]::new($false))
        Write-Output "Verified $($inventory.Count) resources: $zipPath"
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) { Remove-Item -LiteralPath $temporaryPath }
    }
} finally { Pop-Location }
