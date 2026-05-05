# Finish topo uploads after splitting topo_vector_part16 (Mapbox limit on original p16).
$ErrorActionPreference = "Stop"
$frontend = Split-Path -Parent $PSScriptRoot
Set-Location $frontend

$batch = @(
  @{ Zip = "public/data/topo_chunks/topo_vector_part16_part01.zip"; Id = "keethu-j.eco_topo_nyc_p16a" },
  @{ Zip = "public/data/topo_chunks/topo_vector_part16_part02.zip"; Id = "keethu-j.eco_topo_nyc_p16b" },
  @{ Zip = "public/data/topo_chunks/topo_vector_part16_part03.zip"; Id = "keethu-j.eco_topo_nyc_p16c" }
)
foreach ($c in $batch) {
  Write-Host "`n=== $($c.Id) ===" -ForegroundColor Cyan
  npm run upload:tileset -- --file $c.Zip --tileset $c.Id --name "Eco-Sentry NYC topo p16 sub"
  if ($LASTEXITCODE -ne 0) { throw "Failed $($c.Id)" }
}

$i = 0
Get-ChildItem -LiteralPath "public/data/topo_chunks" -Filter "topo_vector_part16_part04_part*.zip" | Sort-Object Name | ForEach-Object {
  $i++
  $id = "keethu-j.eco_topo_nyc_p16d{0:D2}" -f $i
  $rel = "public/data/topo_chunks/" + $_.Name
  Write-Host "`n=== $id ($($_.Name)) ===" -ForegroundColor Cyan
  npm run upload:tileset -- --file $rel --tileset $id --name "Eco-Sentry NYC topo p16 d$i"
  if ($LASTEXITCODE -ne 0) { throw "Failed $id" }
}

Write-Host "`nPart16 sub-uploads complete (p16a,b,c + p16d01..d08)." -ForegroundColor Green
