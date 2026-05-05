# Same as upload-topo-chunks.ps1 but only processes parts >= StartPart (default 2).
param([int]$StartPart = 2)

$ErrorActionPreference = "Stop"
$frontend = Split-Path -Parent $PSScriptRoot
Set-Location $frontend

if (-not $env:MAPBOX_USERNAME) {
  $envPath = Join-Path $frontend ".env"
  if (Test-Path -LiteralPath $envPath) {
    Get-Content -LiteralPath $envPath | ForEach-Object {
      if ($_ -match '^\s*MAPBOX_USERNAME\s*=\s*(.+)\s*$') {
        $env:MAPBOX_USERNAME = $Matches[1].Trim()
      }
    }
  }
}
$user = $env:MAPBOX_USERNAME
if (-not $user) { throw "Set MAPBOX_USERNAME in frontend/.env." }

$files = @(Get-ChildItem -LiteralPath "public/data/topo_chunks" -Filter "topo_vector_part*.zip" | Sort-Object Name)
if ($files.Count -eq 0) { throw "No chunks found." }

$idx = 0
foreach ($f in $files) {
  $idx++
  if ($idx -lt $StartPart) { continue }
  $id = "{0}.eco_topo_nyc_p{1:D2}" -f $user, $idx
  Write-Host "`n========== $id  ($($f.Name)) ==========" -ForegroundColor Cyan
  $rel = "public/data/topo_chunks/" + $f.Name
  npm run upload:tileset -- --file $rel --tileset $id --name "Eco-Sentry NYC topo p$idx of $($files.Count)"
  if ($LASTEXITCODE -ne 0) { throw "Upload failed for $id" }
}

Write-Host "`nDone parts $StartPart to $($files.Count)." -ForegroundColor Green
