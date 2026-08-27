# Developer tool: cap bundled logo PNGs at a sane edge length, preserving
# transparency. Logos fetched straight from a bowl's own site can be 3000px+,
# which bloats the installer and gets decoded at full size for a 22px icon.
#
# Usage:  powershell -File scripts/shrink-logos.ps1 [-Dir resources/bowl-logos] [-MaxEdge 512]
param(
  [string]$Dir = "resources/bowl-logos",
  [int]$MaxEdge = 512
)

Add-Type -AssemblyName System.Drawing

$shrunk = 0
foreach ($f in Get-ChildItem $Dir -Filter *.png) {
  $img = [System.Drawing.Image]::FromFile($f.FullName)
  $w = $img.Width
  $h = $img.Height
  if ([Math]::Max($w, $h) -le $MaxEdge) { $img.Dispose(); continue }

  $scale = $MaxEdge / [Math]::Max($w, $h)
  $nw = [Math]::Max(1, [int][Math]::Round($w * $scale))
  $nh = [Math]::Max(1, [int][Math]::Round($h * $scale))

  $bmp = New-Object System.Drawing.Bitmap($nw, $nh, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingMode = 'SourceCopy'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.PixelOffsetMode = 'HighQuality'
  $g.SmoothingMode = 'HighQuality'
  $g.DrawImage($img, 0, 0, $nw, $nh)
  $g.Dispose()
  $img.Dispose()

  $tmp = "$($f.FullName).tmp"
  $bmp.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Move-Item $tmp $f.FullName -Force
  $kb = [int]((Get-Item $f.FullName).Length / 1KB)
  Write-Output "  $($f.Name): ${w}x${h} -> ${nw}x${nh} (${kb}kb)"
  $shrunk++
}
Write-Output "$shrunk file(s) resized in $Dir (cap ${MaxEdge}px)"
