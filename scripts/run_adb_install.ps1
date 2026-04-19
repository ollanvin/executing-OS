param(
  [string]$RepoPath,
  [string]$DeviceId,
  [string]$OutDir
)

$apk = Get-ChildItem "$RepoPath\app\build\outputs\apk\debug\*.apk" | Select-Object -First 1
if (-not $apk) {
  "No debug APK found" | Out-File "$OutDir\adb_install.log" -Encoding UTF8
  exit 1
}

adb -s $DeviceId install -r $apk.FullName 2>&1 | Tee-Object -FilePath "$OutDir\adb_install.log"
$code = $LASTEXITCODE
"EXIT_CODE=$code" | Out-File "$OutDir\adb_install_exit.txt" -Encoding UTF8
exit $code
