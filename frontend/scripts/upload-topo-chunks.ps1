# Upload every topo_vector_part*.zip from public/data/topo_chunks (after split_shapefile_zip.py).
# Reads MAPBOX_USERNAME from frontend/.env if not already set.
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
if (-not $user) {
  throw "Set MAPBOX_USERNAME in frontend/.env or in the environment."
}

$files = @(Get-ChildItem -LiteralPath "public/data/topo_chunks" -Filter "topo_vector_part*.zip" | Sort-Object Name)
if ($files.Count -eq 0) {
  throw "No topo_vector_part*.zip under public/data/topo_chunks — run split_shapefile_zip.py first."
}

$idx = 0
foreach ($f in $files) {
  $idx++
  $id = "{0}.eco_topo_nyc_p{1:D2}" -f $user, $idx
  Write-Host "`n========== $id  ($($f.Name)) ==========" -ForegroundColor Cyan
  $rel = "public/data/topo_chunks/" + $f.Name
  npm run upload:tileset -- --file $rel --tileset $id --name "Eco-Sentry NYC topo p$idx of $($files.Count)"
  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed for $id (exit $LASTEXITCODE)"
  }
}

Write-Host "`nAll $($files.Count) tilesets uploaded and processed." -ForegroundColor Green
