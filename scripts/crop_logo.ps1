Add-Type -AssemblyName System.Drawing

$fullPath = Resolve-Path "public/logo.jpg"
$origImg = [System.Drawing.Bitmap]::new($fullPath.Path)

# Content bounding box discovered: 140, 10, 785, 785 (adjusted to center)
$cropX = 120
$cropY = 120
$cropSize = 785

$cropRect = New-Object System.Drawing.Rectangle $cropX, $cropY, $cropSize, $cropSize
$croppedBitmap = New-Object System.Drawing.Bitmap $cropSize, $cropSize
$graphics = [System.Drawing.Graphics]::FromImage($croppedBitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

$destRect = New-Object System.Drawing.Rectangle 0, 0, $cropSize, $cropSize
$graphics.DrawImage($origImg, $destRect, $cropRect, [System.Drawing.GraphicsUnit]::Pixel)

# Save as public/logo.png (and backup/update logo.jpg)
$croppedBitmap.Save((Resolve-Path "public").Path + "/logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$croppedBitmap.Save((Resolve-Path "public").Path + "/logo-cropped.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)

Write-Output "Cropped logo saved as public/logo.png (785x785 full space)"

$graphics.Dispose()
$croppedBitmap.Dispose()
$origImg.Dispose()
