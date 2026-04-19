param(
  [string]$DeviceId,
  [string]$OutDir
)

adb -s $DeviceId logcat -c
Start-Sleep -Seconds 3
adb -s $DeviceId logcat -d -s MPC_SCREEN MPC_OVERLAY MPC_ACTION MPC_IMPORTANCE 2>&1 `
  | Tee-Object -FilePath "$OutDir\adb_logcat.txt"
$code = $LASTEXITCODE
"EXIT_CODE=$code" | Out-File "$OutDir\adb_logcat_exit.txt" -Encoding UTF8
exit $code
