#Requires -Version 5.1
# neo.ico from ui\perpy.svg — ImageMagick when available (pixel match to browser), else GDI+ approximation
$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot

$defaultRoot = "C:\Users\user\Dev\local-agent"
if (Test-Path (Join-Path $defaultRoot "config.json")) {
    $root = $defaultRoot
}
else {
    $root = (Resolve-Path (Join-Path $scriptDir "..")).Path
}

$assets = Join-Path $root "assets"
if (-not (Test-Path $assets)) {
    New-Item -ItemType Directory -Path $assets | Out-Null
}
$icoPath = Join-Path $assets "neo.ico"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $r2 = [math]::Min($r, [math]::Min($w, $h) / 2.0)
    $d = $r2 * 2.0
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-HexRingStationBitmap([int]$size) {
    $fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $size, $size, $fmt
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $g.Clear([System.Drawing.Color]::Transparent)

    # Match SVG: rx="15" on 64 (slightly rounder app tile)
    $rx = [float]((15.0 / 64.0) * $size)
    $roundPath = New-RoundedRectPath 0.0 0.0 ([float]$size) ([float]$size) $rx
    $g.SetClip($roundPath)

    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 6, 8, 13))
    $g.FillPath($bg, $roundPath)
    $bg.Dispose()

    $cx = [float]($size / 2.0)
    $cy = [float]($size / 2.0)
    $s = [float]($size / 64.0)

    $ro = [float](25.5 * $s)
    $rectO = New-Object System.Drawing.RectangleF (($cx - $ro), ($cy - $ro), (2.0 * $ro), (2.0 * $ro))

    # Match assets/perpy.svg: stroke-width 9 / 3.4, dasharray 15.5 5.2, rotate(12 32 32)
    $wBack = [math]::Max(2.0, 9.0 * $s)
    $wFore = [math]::Max(1.0, 3.4 * $s)
    $dashLen = [math]::Max(1.2, 15.5 * $s)
    $gapLen = [math]::Max(0.6, 5.2 * $s)
    $pat = [single[]]@([single]$dashLen, [single]$gapLen)

    $penBack = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 58, 80, 136), $wBack)
    $penBack.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Custom
    $penBack.DashPattern = $pat
    $penBack.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
    $penBack.StartCap = [System.Drawing.Drawing2D.LineCap]::Flat
    $penBack.EndCap = [System.Drawing.Drawing2D.LineCap]::Flat

    # Mid-blend of SVG gradient #7f94ff -> #d94fff
    $penRing = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(250, 159, 118, 255), $wFore)
    $penRing.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Custom
    $penRing.DashPattern = $pat
    $penRing.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
    $penRing.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
    $penRing.EndCap = [System.Drawing.Drawing2D.LineCap]::Square

    $gSave = $g.Save()
    $g.TranslateTransform($cx, $cy)
    $g.RotateTransform(12.0)
    $g.TranslateTransform(-$cx, -$cy)
    $g.DrawEllipse($penBack, $rectO)
    $g.DrawEllipse($penRing, $rectO)
    $g.Restore($gSave)

    function HexPoints([float]$cx0, [float]$cy0, [float]$r) {
        $pts = New-Object System.Drawing.PointF[] 6
        for ($i = 0; $i -lt 6; $i++) {
            $ang = ($i * 60.0 - 90.0) * [math]::PI / 180.0
            $pts[$i] = New-Object System.Drawing.PointF (($cx0 + $r * [math]::Cos($ang)), ($cy0 + $r * [math]::Sin($ang)))
        }
        return $pts
    }

    $rOuter = [float](12.2 * $s)
    $rInner = [float](7.2 * $s)
    $penHexO = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(250, 184, 191, 255)), ([math]::Max(0.9, 1.15 * $s))
    $penHexI = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(245, 159, 141, 255)), ([math]::Max(0.75, 0.95 * $s))
    $penStrut = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(235, 143, 120, 255)), ([math]::Max(0.55, 0.75 * $s))

    $ho = HexPoints $cx $cy $rOuter
    $hi = HexPoints $cx $cy $rInner
    $g.DrawPolygon($penHexO, $ho)
    $g.DrawPolygon($penHexI, $hi)

    for ($i = 0; $i -lt 6; $i++) {
        $g.DrawLine($penStrut, $hi[$i], $ho[$i])
    }

    $hubR = [math]::Max(1.2, 2.1 * $s)
    $hubPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(252, 228, 220, 255)), ([math]::Max(0.6, 0.9 * $s))
    $hubFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 13, 17, 26))
    $g.FillEllipse($hubFill, ($cx - $hubR), ($cy - $hubR), (2 * $hubR), (2 * $hubR))
    $g.DrawEllipse($hubPen, ($cx - $hubR), ($cy - $hubR), (2 * $hubR), (2 * $hubR))

    $g.ResetClip()
    $roundPath.Dispose()

    $hubPen.Dispose()
    $hubFill.Dispose()
    $penStrut.Dispose()
    $penHexI.Dispose()
    $penHexO.Dispose()
    $penRing.Dispose()
    $penBack.Dispose()
    $g.Dispose()
    return $bmp
}

function Write-PngIco([string]$path, [int[]]$sizes) {
    $pngChunks = New-Object System.Collections.Generic.List[byte[]]
    $dimBytes = New-Object System.Collections.Generic.List[byte]
    foreach ($sz in $sizes) {
        $bmp = New-HexRingStationBitmap $sz
        $ms = New-Object System.IO.MemoryStream
        try {
            $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
            $bytes = $ms.ToArray()
        }
        finally {
            $bmp.Dispose()
            $ms.Dispose()
        }
        $pngChunks.Add($bytes)
        if ($sz -ge 256) {
            $dimBytes.Add(0)
        }
        else {
            $dimBytes.Add([byte]$sz)
        }
    }

    $count = $pngChunks.Count
    $entryHeaderBytes = 6 + (16 * $count)
    $offset = [uint32]$entryHeaderBytes
    $fs = [System.IO.File]::Create($path)
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
        $bw.Write([uint16]0)
        $bw.Write([uint16]1)
        $bw.Write([uint16]$count)

        for ($i = 0; $i -lt $count; $i++) {
            $wh = $dimBytes[$i]
            $bw.Write($wh)
            $bw.Write($wh)
            $bw.Write([byte]0)
            $bw.Write([byte]0)
            $bw.Write([uint16]0)
            $bw.Write([uint16]0)
            $len = [uint32]$pngChunks[$i].Length
            $bw.Write($len)
            $bw.Write($offset)
            $offset += $len
        }

        for ($i = 0; $i -lt $count; $i++) {
            $bw.Write($pngChunks[$i])
        }
    }
    finally {
        $bw.Dispose()
    }
}

$svgPath = Join-Path $root "ui\perpy.svg"
if (-not (Test-Path -LiteralPath $svgPath)) {
    $svgPath = Join-Path $root "assets\perpy.svg"
}
if (-not (Test-Path -LiteralPath $svgPath)) {
    throw "perpy.svg not found (expected ui\perpy.svg)"
}

$usedMagick = $false
$magick = Get-Command magick -ErrorAction SilentlyContinue
if ($null -ne $magick) {
    try {
        $args = @("-background", "none", $svgPath, "-define", "icon:auto-resize=256,128,64,48,32,16", $icoPath)
        & $magick.Source @args
        if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $icoPath)) {
            $sz = (Get-Item -LiteralPath $icoPath).Length
            if ($sz -gt 200) { $usedMagick = $true }
        }
    }
    catch {
        $usedMagick = $false
    }
}

if (-not $usedMagick) {
    Write-PngIco $icoPath @(256, 64, 48, 32, 16)
}

$legacy = Join-Path $assets "perpy.ico"
if (Test-Path $legacy) {
    Remove-Item -LiteralPath $legacy -Force
}

Write-Host $icoPath
if (-not $usedMagick) {
    Write-Host "Note: Install ImageMagick (magick on PATH) for ICO that exactly matches perpy.svg."
}
