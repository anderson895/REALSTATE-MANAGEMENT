# Rebuilds the launcher's icons from the logo the application itself draws.
#
#   powershell -ExecutionPolicy Bypass -File scripts\make-app-icon.ps1
#
# Run this after changing apps/internal/public/logo.png. It writes:
#
#   apps/internal/public/sfsr-internal.ico   the desktop shortcut's icon
#   apps/internal/app/icon.png               the favicon, which is what the
#                                            taskbar shows while the app window
#                                            is open
#
# -- Why two files ---------------------------------------------------------
#
# They are read from different places. A .lnk carries its own icon and needs a
# real .ico; the window's taskbar icon comes from the site's favicon, because
# in --app mode the browser takes it from the page rather than the shortcut.
# Generating both from one source is what stops the launcher and the
# application from ending up with different marks.
#
# -- Why the .ico is assembled by hand --------------------------------------
#
# System.Drawing can save a .ico, but only a single 32x32 frame, which looks
# soft everywhere else. An .ico is a small container around image data, so the
# six frames are rendered separately and the container written directly.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logo = Join-Path $root 'apps\internal\public\logo.png'
$icoOut = Join-Path $root 'apps\internal\public\sfsr-internal.ico'
$pngOut = Join-Path $root 'apps\internal\app\icon.png'

if (-not (Test-Path $logo)) { throw "Logo not found: $logo" }

$src = [System.Drawing.Image]::FromFile($logo)
Write-Output "source: logo.png ($($src.Width) x $($src.Height))"

function New-Square([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.PixelOffsetMode = 'HighQuality'
    $g.Clear([System.Drawing.Color]::Transparent)

    # Less padding at small sizes, or the mark disappears into the margin.
    $ratio = if ($size -le 32) { 0.94 } else { 0.78 }
    $h = [int]($size * $ratio)
    $w = [int]($h * $src.Width / $src.Height)
    $g.DrawImage($src, [int](($size - $w) / 2), [int](($size - $h) / 2), $w, $h)
    $g.Dispose()
    return $bmp
}

function Get-PngBytes($bitmap) {
    $ms = New-Object System.IO.MemoryStream
    $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return $bytes
}

# -- The favicon ------------------------------------------------------------
$fav = New-Square 256
$fav.Save($pngOut, [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose()
Write-Output "wrote: apps/internal/app/icon.png"

# -- The .ico ---------------------------------------------------------------
$sizes = @(16, 32, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $bmp = New-Square $size
    $frames += , @{ size = $size; data = (Get-PngBytes $bmp) }
    $bmp.Dispose()
}
$src.Dispose()

$out = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter($out)

# ICONDIR: reserved, type 1 = icon, image count
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$frames.Count)

# One 16-byte directory entry each, then every payload after them all.
$offset = 6 + $frames.Count * 16
foreach ($f in $frames) {
    # 0 means 256 -- the field is a single byte and cannot hold the number.
    $dim = if ($f.size -ge 256) { 0 } else { $f.size }
    $w.Write([byte]$dim)      # width
    $w.Write([byte]$dim)      # height
    $w.Write([byte]0)         # palette entries, none
    $w.Write([byte]0)         # reserved
    $w.Write([uint16]1)       # colour planes
    $w.Write([uint16]32)      # bits per pixel
    $w.Write([uint32]$f.data.Length)
    $w.Write([uint32]$offset)
    $offset += $f.data.Length
}
foreach ($f in $frames) { $w.Write($f.data) }

$w.Flush()
[System.IO.File]::WriteAllBytes($icoOut, $out.ToArray())
$w.Dispose(); $out.Dispose()

Write-Output "wrote: apps/internal/public/sfsr-internal.ico ($($frames.Count) sizes: $($sizes -join ', '))"
Write-Output ""
Write-Output "Run create-internal-shortcut.bat afterwards to refresh the shortcuts."
