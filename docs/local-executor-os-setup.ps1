# Local Executor OS — Windows bootstrap (operator copy/paste)
# Run in elevated PowerShell if installers require admin.
# Prereq: Windows 10/11, PowerShell 5+ or pwsh 7+

$ErrorActionPreference = "Stop"

Write-Host "=== Local Executor OS — dependency install ===" -ForegroundColor Cyan

function Test-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# 1) Git
if (-not (Test-Cmd git)) {
    if (Test-Cmd winget) {
        winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "Install Git from https://git-scm.com/download/win" -ForegroundColor Yellow
    }
}

# 2) Temurin JDK 17 (Android / Gradle)
if (-not (Test-Cmd java)) {
    if (Test-Cmd winget) {
        winget install --id EclipseAdoptium.Temurin.17.JDK -e --source winget --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "Install JDK 17+ (Temurin) manually." -ForegroundColor Yellow
    }
}

# 3) Python 3.11+
if (-not (Test-Cmd python)) {
    if (Test-Cmd winget) {
        winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements
    }
}

# 4) Node.js (WebStub / web builds)
if (-not (Test-Cmd node)) {
    if (Test-Cmd winget) {
        winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
    }
}

# 5) Android SDK (command-line tools)
# Set ANDROID_HOME after install; Android Studio can install SDK + platform-tools.
if (-not $env:ANDROID_HOME) {
    Write-Host @"

ANDROID_HOME is not set. After installing Android Studio or sdkmanager:
  Example (adjust path):
    [Environment]::SetEnvironmentVariable(
      'ANDROID_HOME',
      '$env:LOCALAPPDATA\Android\Sdk',
      'User'
    )
  Then install platforms + build-tools + platform-tools:
    sdkmanager \"platform-tools\" \"platforms;android-35\" \"build-tools;35.0.0\"
"@ -ForegroundColor Yellow
}

# 6) Optional: standalone Gradle (projects use wrapper `gradlew.bat` by default)
if (-not (Test-Cmd gradle)) {
    Write-Host "Gradle wrapper is used by Android projects; standalone Gradle optional." -ForegroundColor DarkGray
}

# 7) Paparazzi
Write-Host @"

Paparazzi runs via Gradle plugin in the Android app module (see Cash App Paparazzi docs).
Ensure AGP/SDK versions match the project; golden snapshots live under the module test resources.

"@ -ForegroundColor DarkGray

Write-Host "=== Done. Open a new terminal so PATH updates apply. ===" -ForegroundColor Green
