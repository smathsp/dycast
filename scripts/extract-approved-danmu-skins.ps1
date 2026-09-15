param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null

$definitions = @(
  @{ Name = 'clear';   Crop = @(320, 80, 1340, 152); Panel = @(185, 60, 735, 74);  PanelStart = @(4, 10, 25); PanelEnd = @(6, 14, 34) },
  @{ Name = 'phoenix'; Crop = @(320, 232, 1340, 178); Panel = @(187, 70, 690, 76);  PanelStart = @(58, 22, 5); PanelEnd = @(24, 9, 2); PanelAlphaStart = 224; PanelAlphaEnd = 190 },
  @{ Name = 'astral';  Crop = @(320, 410, 1340, 174); Panel = @(192, 72, 720, 76);  PanelStart = @(31, 12, 67); PanelEnd = @(8, 20, 47); PanelAlphaStart = 224; PanelAlphaEnd = 190 },
  @{ Name = 'dragon';  Crop = @(255, 565, 1420, 300); Panel = @(230, 100, 750, 105); PanelStart = @(74, 8, 10); PanelEnd = @(31, 4, 9); PanelAlphaStart = 232; PanelAlphaEnd = 198 }
)

$sourceImage = [System.Drawing.Bitmap]::new($Source)
try {
  foreach ($definition in $definitions) {
    $crop = $definition.Crop
    $target = [System.Drawing.Bitmap]::new($crop[2], $crop[3], [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage(
          $sourceImage,
          [System.Drawing.Rectangle]::new(0, 0, $crop[2], $crop[3]),
          [System.Drawing.Rectangle]::new($crop[0], $crop[1], $crop[2], $crop[3]),
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally {
        $graphics.Dispose()
      }

      $panel = $definition.Panel
      for ($y = 0; $y -lt $target.Height; $y++) {
        for ($x = 0; $x -lt $target.Width; $x++) {
          $insidePanel = $x -ge $panel[0] -and $x -lt ($panel[0] + $panel[2]) -and $y -ge $panel[1] -and $y -lt ($panel[1] + $panel[3])
          if ($insidePanel) {
            $target.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
            continue
          }

          $pixel = $target.GetPixel($x, $y)
          $brightness = [Math]::Max($pixel.R, [Math]::Max($pixel.G, $pixel.B))
          $darkest = [Math]::Min($pixel.R, [Math]::Min($pixel.G, $pixel.B))
          $saturation = $brightness - $darkest
          $wrongTierColor = switch ($definition.Name) {
            'clear' { $pixel.R -gt ($pixel.B * 1.22) -and $pixel.R -gt 95 }
            'phoenix' { $pixel.B -gt ($pixel.R * 1.18) -and $pixel.B -gt 95 }
            'astral' { $pixel.R -gt ($pixel.B * 1.24) -and $pixel.G -gt ($pixel.B * .48) -and $pixel.R -gt 100 }
            'dragon' { $pixel.B -gt ($pixel.R * 1.18) -and $pixel.B -gt ($pixel.G * 1.28) -and $pixel.B -gt 95 }
            default { $false }
          }
          if ($wrongTierColor -or $brightness -le 65 -or ($brightness -lt 105 -and $saturation -lt 35)) {
            $target.SetPixel($x, $y, [System.Drawing.Color]::Transparent)
          } elseif ($brightness -lt 130) {
            $alpha = [Math]::Min(225, [Math]::Max(0, [Math]::Round(($brightness - 65) / 65 * 225)))
            $target.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
          }
        }
      }

      # The content plate uses the very same pixel rectangle that removed the
      # reference copy. Baking it into the artwork prevents CSS percentages
      # from drifting away from the ornate frame at different resolutions.
      $panelGraphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $panelRect = [System.Drawing.Rectangle]::new($panel[0], $panel[1], $panel[2], $panel[3])
        $start = $definition.PanelStart
        $end = $definition.PanelEnd
        $startAlpha = if ($null -ne $definition.PanelAlphaStart) { $definition.PanelAlphaStart } else { 250 }
        $endAlpha = if ($null -ne $definition.PanelAlphaEnd) { $definition.PanelAlphaEnd } else { 246 }
        $startColor = [System.Drawing.Color]::FromArgb($startAlpha, $start[0], $start[1], $start[2])
        $endColor = [System.Drawing.Color]::FromArgb($endAlpha, $end[0], $end[1], $end[2])
        $plateBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
          $panelRect,
          $startColor,
          $endColor,
          [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
        )
        try {
          $panelGraphics.FillRectangle($plateBrush, $panelRect)
        } finally {
          $plateBrush.Dispose()
        }
      } finally {
        $panelGraphics.Dispose()
      }

      $output = Join-Path $OutputDirectory ("{0}-approved.png" -f $definition.Name)
      $target.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $target.Dispose()
    }
  }
} finally {
  $sourceImage.Dispose()
}
