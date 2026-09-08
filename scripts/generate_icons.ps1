Add-Type -AssemblyName System.Drawing

function Generate-Icon {
    param(
        [string]$InputPath,
        [string]$OutputPath,
        [int]$Width,
        [int]$Height
    )
    
    $fullIn = Resolve-Path $InputPath
    $src = [System.Drawing.Image]::FromFile($fullIn)
    $bitmap = New-Object System.Drawing.Bitmap $Width, $Height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    
    # Draw logo taking 100% full space edge-to-edge
    $destRect = New-Object System.Drawing.Rectangle 0, 0, $Width, $Height
    $graphics.DrawImage($src, $destRect)
    
    $ext = [System.IO.Path]::GetExtension($OutputPath).ToLower()
    if ($ext -eq ".jpg" -or $ext -eq ".jpeg") {
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    } else {
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    
    $graphics.Dispose()
    $bitmap.Dispose()
    $src.Dispose()
    Write-Output "Created: $OutputPath"
}

# 1. Update logo.jpg itself with the cropped 100% full space version
Copy-Item -Path "public/logo.png" -Destination "public/logo-full.png"
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/logo.jpg" -Width 1024 -Height 1024

# 2. Generate full-space PWA & Desktop icons
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/pwa-192x192.png" -Width 192 -Height 192
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/pwa-512x512.png" -Width 512 -Height 512
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/pwa-maskable-512x512.png" -Width 512 -Height 512
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/apple-touch-icon.png" -Width 180 -Height 180
Generate-Icon -InputPath "public/logo.png" -OutputPath "public/favicon-32x32.png" -Width 32 -Height 32
Write-Output "All icons regenerated with 100% full space!"
