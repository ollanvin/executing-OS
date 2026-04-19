param(
  [string]$DeviceId,
  [string]$PhoneNumber,
  [string]$OutDir
)

adb -s $DeviceId emu gsm call $PhoneNumber 2>&1 | Tee-Object -FilePath "$OutDir\adb_call.log"
$code = $LASTEXITCODE
"EXIT_CODE=$code" | Out-File "$OutDir\adb_call_exit.txt" -Encoding UTF8
exit $code
