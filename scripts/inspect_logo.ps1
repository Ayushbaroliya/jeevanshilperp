Add-Type -AssemblyName System.Drawing
$fullPath = Resolve-Path "public/logo.jpg"
$img = [System.Drawing.Bitmap]::new($fullPath.Path)
Write-Output "Image Size: $($img.Width) x $($img.Height)"

$minX = $img.Width; $minY = $img.Height; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $img.Height; $y += 5) {
    for ($x = 0; $x -lt $img.Width; $x += 5) {
        $p = $img.GetPixel($x, $y)
        if ($p.R -lt 240 -or $p.G -lt 240 -or $p.B -lt 240) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}
Write-Output "Content Bounding Box: minX=$minX, minY=$minY, maxX=$maxX, maxY=$maxY"
Write-Output "Content Width: $($maxX - $minX), Content Height: $($maxY - $minY)"
Write-Output "Left Margin: $minX, Right Margin: $($img.Width - $maxX), Top Margin: $minY, Bottom Margin: $($img.Height - $maxY)"
$img.Dispose()
