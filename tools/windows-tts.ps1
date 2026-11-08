param(
  [Parameter(Mandatory=$true)][ValidateSet('voices','synthesize')][string]$Mode,
  [string]$TextBase64,
  [string]$VoiceName,
  [int]$Rate = 0,
  [string]$OutputPath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | ForEach-Object {
    $info = $_.VoiceInfo
    [pscustomobject]@{ name = $info.Name; culture = $info.Culture.Name; gender = $info.Gender.ToString() }
  })
  if ($Mode -eq 'voices') {
    ConvertTo-Json -InputObject $voices -Compress
    exit 0
  }
  $vietnamese = @($voices | Where-Object { $_.culture -like 'vi-*' })
  if ($vietnamese.Count -eq 0) { throw 'No Vietnamese voice (vi-VN) is installed. Install a Vietnamese speech voice in Windows Settings > Time & language > Speech.' }
  if (-not $VoiceName) { $VoiceName = $vietnamese[0].name }
  if (-not ($vietnamese | Where-Object { $_.name -eq $VoiceName })) { throw 'The selected voice is not an installed Vietnamese voice.' }
  if (-not $TextBase64 -or -not $OutputPath) { throw 'Text or WAV output path is missing.' }
  $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TextBase64))
  if ([string]::IsNullOrWhiteSpace($text) -or $text.Length -gt 5000) { throw 'Dialogue must contain between 1 and 5,000 characters.' }
  $synth.SelectVoice($VoiceName)
  $synth.Rate = [Math]::Max(-5, [Math]::Min(5, $Rate))
  $synth.SetOutputToWaveFile($OutputPath)
  [void]$synth.Speak($text)
  $synth.SetOutputToNull()
  Write-Output 'OK'
} finally {
  $synth.Dispose()
}
