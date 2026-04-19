#Requires -Version 5.1
<#
  Desktop\NeO.lnk — Target: scripts\start-perpy.bat (default) or start-bot.bat (-BotOnly).
  Icon: assets\neo.ico (regenerated every run).
  Removes old Perpy/NeO shortcuts from every user desktop folder (Explorer merges several paths).
#>
param(
    [switch]$BotOnly
)
$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

$defaultRoot = "C:\Users\user\Dev\local-agent"
if (Test-Path (Join-Path $defaultRoot "config.json")) {
    $root = $defaultRoot
}
else {
    $root = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$gen = Join-Path $scriptDir "generate-perpy-ico.ps1"
& $gen

$icoPath = Join-Path $root "assets\neo.ico"
if (-not (Test-Path $icoPath)) {
    throw "neo.ico not found: $icoPath"
}

$batName = if ($BotOnly) { "start-bot.bat" } else { "start-perpy.bat" }
$targetBat = Join-Path $root "scripts\$batName"
if (-not (Test-Path $targetBat)) {
    throw "Missing $targetBat"
}

$targetBatFull = [System.IO.Path]::GetFullPath($targetBat)

function Get-ShellDesktopPath {
    try {
        $raw = (Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders" -ErrorAction Stop).Desktop
        if (-not [string]::IsNullOrWhiteSpace($raw)) {
            $expanded = [Environment]::ExpandEnvironmentVariables($raw)
            return [System.IO.Path]::GetFullPath($expanded)
        }
    }
    catch {}
    $fallback = [Environment]::GetFolderPath("Desktop")
    if (-not [string]::IsNullOrWhiteSpace($fallback)) {
        return [System.IO.Path]::GetFullPath($fallback)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $env:USERPROFILE "Desktop"))
}

function Get-UserDesktopDirectories {
    $candidates = [System.Collections.ArrayList]@(
        [Environment]::GetFolderPath("Desktop")
        (Join-Path $env:USERPROFILE "Desktop")
        (Join-Path $env:USERPROFILE "OneDrive\Desktop")
    )
    Get-ChildItem -LiteralPath $env:USERPROFILE -Directory -Filter "OneDrive*" -ErrorAction SilentlyContinue |
        ForEach-Object {
            $odDesk = Join-Path $_.FullName "Desktop"
            [void]$candidates.Add($odDesk)
        }
    $seen = @{}
    foreach ($p in $candidates) {
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        try {
            $full = [System.IO.Path]::GetFullPath($p)
        }
        catch {
            continue
        }
        if ($seen.ContainsKey($full)) { continue }
        if (-not (Test-Path -LiteralPath $full)) { continue }
        if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
        $seen[$full] = $true
        Write-Output $full
    }
}

function Remove-FileIfExists([string]$path) {
    if (Test-Path -LiteralPath $path) {
        Remove-Item -LiteralPath $path -Force
        Write-Host "Removed: $path"
    }
}

function Remove-ObsoleteLauncherShortcuts([string]$desktopDir) {
    if (-not (Test-Path -LiteralPath $desktopDir)) { return }
    $wsh = New-Object -ComObject WScript.Shell
    $byName = @("Perpy.lnk", "NeO.lnk", "perpy.lnk", "neo.lnk", "PERPY.LNK", "NEO.LNK")
    foreach ($name in $byName) {
        Remove-FileIfExists (Join-Path $desktopDir $name)
    }
    Get-ChildItem -LiteralPath $desktopDir -Filter "*.lnk" -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            $sc = $wsh.CreateShortcut($_.FullName)
            $t = $sc.TargetPath
            if ([string]::IsNullOrWhiteSpace($t)) { return }
            if ($t -notmatch '\.(bat|cmd)\s*$') { return }
            try {
                $tf = [System.IO.Path]::GetFullPath($t)
            }
            catch {
                return
            }
            if ($tf -ieq $targetBatFull) {
                Remove-Item -LiteralPath $_.FullName -Force
                Write-Host "Removed (same target): $($_.FullName)"
                return
            }
            $leaf = [System.IO.Path]::GetFileName($tf)
            if (($leaf -ieq "start-perpy.bat" -or $leaf -ieq "start-bot.bat") -and ($tf -like "*\local-agent\*")) {
                Remove-Item -LiteralPath $_.FullName -Force
                Write-Host "Removed (local-agent launcher): $($_.FullName)"
            }
        }
        catch {
            # ignore broken .lnk
        }
    }
}

$primaryDesktop = [System.IO.Path]::GetFullPath((Get-ShellDesktopPath))
$scanDirs = @(Get-UserDesktopDirectories)
$toClean = @{}
foreach ($p in @($primaryDesktop) + $scanDirs) {
    if ([string]::IsNullOrWhiteSpace($p)) { continue }
    try {
        $full = [System.IO.Path]::GetFullPath($p)
    }
    catch {
        continue
    }
    if (-not (Test-Path -LiteralPath $full -PathType Container)) { continue }
    $toClean[$full.ToLowerInvariant()] = $full
}

if (-not $toClean.Count) {
    throw "No desktop directory found (Desktop / OneDrive\Desktop)."
}

foreach ($dir in $toClean.Values) {
    Write-Host "Cleaning desktop folder: $dir"
    Remove-ObsoleteLauncherShortcuts $dir
}

if (-not (Test-Path -LiteralPath $primaryDesktop)) {
    New-Item -ItemType Directory -Path $primaryDesktop -Force | Out-Null
}
$primaryDesktop = [System.IO.Path]::GetFullPath($primaryDesktop)
Write-Host "Shell Desktop (new shortcut here): $primaryDesktop"

$lnkPath = Join-Path $primaryDesktop "NeO.lnk"
$wsh2 = New-Object -ComObject WScript.Shell
$shortcut = $wsh2.CreateShortcut($lnkPath)
$shortcut.TargetPath = $targetBat
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = "$icoPath,0"
$shortcut.WindowStyle = 1
$shortcut.Description = "NeO — Local Agent Engine + Bot Server + Browser"
$shortcut.Save()

Write-Host "Created: $lnkPath"
Write-Host "Icon: $icoPath"
