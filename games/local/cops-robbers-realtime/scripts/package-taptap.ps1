param([switch]$WithService, [switch]$WithoutService, [switch]$WithAds, [switch]$WithoutAds)
$ErrorActionPreference = 'Stop'
if ($WithService -and $WithoutService) { throw 'Choose -WithService or -WithoutService' }
if ($WithAds -and $WithoutAds) { throw 'Choose -WithAds or -WithoutAds' }
$gameRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = Join-Path $gameRoot 'dist'
$output = Join-Path $gameRoot 'outputs/taptap'
$qa = Join-Path $gameRoot 'docs/qa'
function FileHash($path) {
  $stream = [IO.File]::OpenRead($path)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
  finally { $stream.Dispose(); $hasher.Dispose() }
}
Push-Location $gameRoot
try {
  $serviceArgs = @()
  if ($WithService) { $serviceArgs += '--with-service' }
  if ($WithoutService) { $serviceArgs += '--without-service' }
  if ($WithAds) { $serviceArgs += '--with-ads' }
  if ($WithoutAds) { $serviceArgs += '--without-ads' }
  node scripts/build.mjs --taptap @serviceArgs
  if ($LASTEXITCODE -ne 0) { throw 'H5 build failed' }
  if (!(Test-Path -LiteralPath (Join-Path $dist 'index.html'))) { throw 'Missing dist/index.html' }
  New-Item -ItemType Directory -Force -Path $output, $qa | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zipPath = Join-Path $output 'cops-robbers-realtime-h5.zip'
  $temporary = Join-Path $output ('package-' + [guid]::NewGuid() + '.zip')
  $inventory = @()
  $archive = [IO.Compression.ZipFile]::Open($temporary, 'Create')
  try {
    foreach ($file in Get-ChildItem -LiteralPath $dist -Recurse -File | Sort-Object FullName) {
      $suffix = $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
      $entryName = 'dist/' + $suffix
      [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entryName, 'Optimal') | Out-Null
      $inventory += [ordered]@{ path = $entryName; bytes = $file.Length; sha256 = (FileHash $file.FullName) }
    }
  } finally { $archive.Dispose() }
  $archive = [IO.Compression.ZipFile]::OpenRead($temporary)
  try {
    if ($archive.Entries.Count -ne $inventory.Count) { throw 'ZIP inventory mismatch' }
    foreach ($item in $inventory) {
      $entry = $archive.GetEntry($item.path)
      if (!$entry -or $entry.Length -ne $item.bytes) { throw ('ZIP length mismatch: ' + $item.path) }
      $stream = $entry.Open()
      $hasher = [Security.Cryptography.SHA256]::Create()
      try { $hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
      finally { $stream.Dispose(); $hasher.Dispose() }
      if ($hash -ne $item.sha256) { throw ('ZIP hash mismatch: ' + $item.path) }
    }
  } finally { $archive.Dispose() }
  Move-Item -LiteralPath $temporary -Destination $zipPath -Force
  $report = [ordered]@{
    generatedAt = [DateTimeOffset]::Now.ToString('o')
    artifact = 'outputs/taptap/cops-robbers-realtime-h5.zip'
    entry = 'dist/index.html'
    bytes = (Get-Item -LiteralPath $zipPath).Length
    sha256 = (FileHash $zipPath)
    validation = 'Every ZIP entry was reopened and checked against the production dist bytes. No TapTap upload, real SDK ad playback or device acceptance.'
    files = $inventory
  }
  [IO.File]::WriteAllText((Join-Path $qa 'taptap-h5-package.json'), ($report | ConvertTo-Json -Depth 5) + "`n", (New-Object Text.UTF8Encoding $false))
  Write-Output ('TapTap H5 package: ' + $zipPath)
  Write-Output ('SHA256: ' + $report.sha256)
} finally { Pop-Location }
