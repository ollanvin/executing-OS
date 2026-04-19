param(
  [string]$RepoPath,
  [string]$OutDir
)

Set-Location $RepoPath
./gradlew assembleDebug 2>&1 | Tee-Object -FilePath "$OutDir\build.log"
$code = $LASTEXITCODE
"EXIT_CODE=$code" | Out-File "$OutDir\build_exit.txt" -Encoding UTF8
exit $code
