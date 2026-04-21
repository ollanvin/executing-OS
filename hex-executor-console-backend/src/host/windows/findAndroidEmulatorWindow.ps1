# 창 좌표만 조회 (windowLocator.ts 와 동일 휴리스틱).
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NeoWin32 {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

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
      $best = @{ Hwnd = $h.ToInt64(); X = $r.Left; Y = $r.Top; Width = $w; Height = $hgt }
    }
  }
  catch {}
}

if ($null -eq $best) {
  Write-Output 'NEO_EMULATOR_RECT_JSON:null'
  exit 0
}

$json = (@{
  hwnd   = $best.Hwnd
  x      = $best.X
  y      = $best.Y
  width  = $best.Width
  height = $best.Height
} | ConvertTo-Json -Compress -Depth 4)
Write-Output "NEO_EMULATOR_RECT_JSON:$json"
exit 0
