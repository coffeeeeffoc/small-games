$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$radioRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/resources/audio'))
$source = Get-Content (Join-Path $PSScriptRoot '../assets/scripts/Platform.ts') -Raw -Encoding utf8
$lines = [regex]::Matches($source, "(?m)^  (day|night|priority|critical|clear): \['([^']+)', '([^']+)'\],")
if ($lines.Count -ne 5) { throw 'Expected five bilingual radio cues.' }
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  foreach ($line in $lines) {
    foreach ($language in @('zh', 'en')) {
      $speaker.SelectVoice($(if ($language -eq 'zh') { 'Microsoft Huihui Desktop' } else { 'Microsoft Zira Desktop' }))
      $speaker.Rate = 1
      $radioName = "radio-$($line.Groups[1].Value)-$language"
      $radioPath = Join-Path $radioRoot "$radioName.wav"
      $radioRaw = Join-Path ([IO.Path]::GetTempPath()) "$radioName-$([Guid]::NewGuid()).wav"
      $speaker.SetOutputToWaveFile($radioRaw)
      $speaker.Speak($line.Groups[$(if ($language -eq 'zh') { 2 } else { 3 })].Value)
      $speaker.SetOutputToNull()
      & ffmpeg -hide_banner -loglevel error -y -i $radioRaw -af 'highpass=f=300,lowpass=f=3400,loudnorm=I=-16:TP=-1.5:LRA=7' -ar 22050 -ac 1 $radioPath
      if ($LASTEXITCODE -ne 0 -or (Get-Item $radioPath).Length -lt 1000) { throw "Failed radio cue: $radioName" }
      Remove-Item -LiteralPath $radioRaw
      if (!(Test-Path "$radioPath.meta")) {
        @{ver='1.0.0';importer='audio-clip';imported=$true;uuid=[Guid]::NewGuid().ToString();files=@('.json','.wav');subMetas=@{};userData=@{downloadMode=0}} |
          ConvertTo-Json -Depth 3 | Set-Content "$radioPath.meta" -Encoding utf8NoBOM
      }
    }
  }
} finally { $speaker.Dispose() }
