# Android Emulator 창만 잘라 PNG 저장 (Windows + System.Drawing).
# DPI 100% 가정 — Win10/11 고배율 스케일링 이슈는 후속 Iteration에서 정교화.
param(
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class NeoWin32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

function Find-EmulatorRect {
  $best = $null
  $bestArea = 0
  foreach ($proc in Get-Process -ErrorAction SilentlyContinue) {
    try {
      $h = $proc.MainWindowHandle
      if ($h -eq [IntPtr]::Zero) { continue }
      $title = $proc.MainWindowTitle
      if ([string]::IsNullOrEmpty($title)) { continue }
      if ($title -notmatch 'Android Emulator') { continue }
      $r = New-Object NeoWin32+RECT
      if (-not [NeoWin32]::GetWindowRect($h, [ref]$r)) { continue }
      $w = $r.Right - $r.Left
      $hgt = $r.Bottom - $r.Top
      if ($w -lt 80 -or $hgt -lt 80) { continue }
      $area = $w * $hgt
      if ($area -gt $bestArea) {
        $bestArea = $area
        $best = @{ Left = $r.Left; Top = $r.Top; Right = $r.Right; Bottom = $r.Bottom; Width = $w; Height = $hgt; Title = $title }
      }
    }
    catch {}
  }
  return $best
}

$rect = Find-EmulatorRect
if ($null -eq $rect) {
  [Console]::Error.WriteLine('NEO_EMULATOR_WINDOW_NOT_FOUND')
  exit 2
}

$rx = $rect.Left
$ry = $rect.Top
$rw = $rect.Width
$rh = $rect.Height

$bmp = New-Object System.Drawing.Bitmap $rw, $rh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($rx, $ry, [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size($rw, $rh)))

$parent = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrEmpty($parent) -and -not (Test-Path -LiteralPath $parent)) {
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
}

$bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()

$meta = @{
  x         = $rx
  y         = $ry
  width     = $rw
  height    = $rh
  captureBackend = 'host_window'
  emulatorWindowFound = $true
} | ConvertTo-Json -Compress -Depth 4
Write-Output "NEO_SCREEN_CAPTURE_META_JSON:$meta"
exit 0
