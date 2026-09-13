# Run with Windows PowerShell 5.1: powershell.exe -NoProfile -File scripts/generate-audio.ps1
# Uses only installed Windows voices. Extracts current dialogue from src/game.js.
$ErrorActionPreference = 'Stop'
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) { throw 'FFmpeg is required to compress the installed-voice recordings.' }
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
[Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime] | Out-Null

$asTaskMethod = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1

function Wait-WinRTOperation($Operation, [Type]$ResultType) {
    $task = $asTaskMethod.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.GetAwaiter().GetResult()
}

$audioDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\audio'))
$extractScript = @'
import { CONTACTS } from './src/game.js';
import { mkdirSync, writeFileSync } from 'node:fs';
const voices = { landlord: 'Huihui', courier: 'Kangkang', parcel: 'Yaoyao', installer: 'Kangkang', supervisor: 'Huihui', utility: 'Huihui', wallet: 'Yaoyao', promo: 'Kangkang', shop: 'Yaoyao', network: 'Huihui' };
const lines = Object.entries(CONTACTS).flatMap(([id, contact]) => [...contact.lines, ...contact.replies.map(reply => reply.text)].map((text, index) => ({ file: `${id}-${index}.mp3`, voice: voices[id], text })));
mkdirSync('public/audio', { recursive: true });
writeFileSync('public/audio/lines.json', JSON.stringify(lines, null, 2));
'@
Push-Location ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')))
try {
    & node --input-type=module -e ($extractScript -replace '\r?\n', ' ')
    if ($LASTEXITCODE -ne 0) { throw 'Could not extract current dialogue from src/game.js.' }
} finally {
    Pop-Location
}
$lines = Get-Content -LiteralPath (Join-Path $audioDirectory 'lines.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$synthesizer = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$manifest = [ordered]@{}

try {
    foreach ($line in $lines) {
        $voice = $voices | Where-Object { $_.DisplayName -like "*$($line.voice)*" } | Select-Object -First 1
        if (-not $voice) { $voice = $voices | Where-Object { $_.Language -eq 'zh-CN' } | Select-Object -First 1 }
        if (-not $voice) { throw 'No installed Chinese speech voice is available.' }
        $synthesizer.Voice = $voice
        $stream = Wait-WinRTOperation ($synthesizer.SynthesizeTextToStreamAsync($line.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
        $reader = New-Object Windows.Storage.Streams.DataReader($stream)
        try {
            $length = [uint32]$stream.Size
            $loaded = Wait-WinRTOperation ($reader.LoadAsync($length)) ([uint32])
            if ($loaded -ne $length) { throw "Incomplete recording: $($line.file)" }
            $bytes = New-Object byte[] $length
            $reader.ReadBytes($bytes)
            if ([Text.Encoding]::ASCII.GetString($bytes, 0, 4) -ne 'RIFF' -or $length -lt 1000) {
                throw "Invalid WAV recording: $($line.file)"
            }
            $outputPath = Join-Path $audioDirectory $line.file
            $wavePath = $outputPath + '.source.wav'
            [IO.File]::WriteAllBytes($wavePath, $bytes)
            & ffmpeg -hide_banner -loglevel error -y -i $wavePath -codec:a libmp3lame -b:a 48k $outputPath
            if ($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $outputPath).Length -lt 1000) {
                throw "Could not compress recording: $($line.file)"
            }
            Remove-Item -LiteralPath $wavePath
            $manifest[$line.text] = $line.file
            Write-Output "$($line.file): $((Get-Item -LiteralPath $outputPath).Length) bytes, $($voice.DisplayName)"
        } finally {
            $reader.Dispose()
            $stream.Dispose()
        }
    }
    $manifestJson = ConvertTo-Json -InputObject $manifest -Depth 3
    [IO.File]::WriteAllText((Join-Path $audioDirectory 'manifest.json'), $manifestJson, (New-Object Text.UTF8Encoding($false)))
    Write-Output "Generated and verified $($manifest.Count) local recordings."
} finally {
    $synthesizer.Dispose()
}
