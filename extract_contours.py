"""
extract_contours.py  —  High-res Float32 DEM -> simplified WGS84 contour GeoJSON
Uses rasterio + contourpy + shapely (no GDAL CLI required).

Usage:
    python extract_contours.py [interval_m]  (default 0.5)

Output:
    contours_0p5m.geojson  (next to this script)
"""

import sys, json, math
from pathlib import Path

import numpy as np
import rasterio
from contourpy import contour_generator
from shapely.geometry import LineString
from pyproj import Transformer

# ── Config ───────────────────────────────────────────────────────────────────

TIF_PATH    = Path(__file__).parent / "nyc_final_0.1m.tif"
INTERVAL_M  = float(sys.argv[1]) if len(sys.argv) > 1 else 0.5
# RDP tolerance in source-CRS metres.
# 0.15 m keeps 90-degree kerb/building corners, removes collinear sidewalk points.
RDP_EPS     = 0.15
# Minimum number of points a contour line must have after simplification.
MIN_PTS     = 3

out_name = f"contours_{INTERVAL_M}m.geojson".replace(".", "p")
OUT_PATH = Path(__file__).parent / out_name

# ── Step 1: load raster ──────────────────────────────────────────────────────

print(f"[1/4] Opening {TIF_PATH.name}...")
with rasterio.open(TIF_PATH) as src:
    print(f"      {src.width} x {src.height} px | dtype={src.dtypes[0]} | nodata={src.nodata}")
    print(f"      CRS: {src.crs.to_epsg() or 'compound'}")
    print(f"      Bounds: {src.bounds}")

    # Build per-column (x) and per-row (y) coordinate arrays in source CRS.
    # Using pixel CENTRES (offset 0.5) so contours align with real-world coords.
    tf = src.transform
    ncols, nrows = src.width, src.height
    xs = tf.c + (np.arange(ncols) + 0.5) * tf.a          # easting, shape (ncols,)
    ys = tf.f + (np.arange(nrows) + 0.5) * tf.e          # northing, shape (nrows,) descending

    print(f"      Reading band 1 into memory (~{ncols*nrows*4/1e9:.1f} GB)...")
    data = src.read(1).astype(np.float32)

    nodata = src.nodata if src.nodata is not None else -9999.0
    data[data == nodata] = np.nan

    # Determine source CRS EPSG for reprojection.
    # The TIF uses a compound CRS; we want just the horizontal component.
    try:
        src_epsg = src.crs.to_epsg()  # works for simple CRS
    except Exception:
        src_epsg = None
    # NAD83(2011) / UTM zone 18N covers NYC — fall back to 6347 for this file.
    if src_epsg is None:
        src_epsg = 6347

valid = data[~np.isnan(data)]
elev_min, elev_max = float(np.nanmin(valid)), float(np.nanmax(valid))
print(f"      Elevation range: {elev_min:.2f} – {elev_max:.2f} m")

# ── Step 2: contour extraction ───────────────────────────────────────────────

levels = np.arange(
    math.ceil(elev_min / INTERVAL_M) * INTERVAL_M,
    elev_max + INTERVAL_M,
    INTERVAL_M,
)
print(f"\n[2/4] Extracting {len(levels)} contour levels at {INTERVAL_M} m intervals...")

# contourpy with x/y arrays produces contours directly in CRS coordinates.
# chunk_size controls how much of the grid is processed at once (memory trade-off).
cg = contour_generator(x=xs, y=ys, z=data, chunk_size=500)

raw_lines = []   # list of (elev, np.ndarray shape (n,2))
for level in levels:
    line_list = cg.lines(level)  # list of arrays, each (n, 2) in CRS coords
    for arr in line_list:
        raw_lines.append((float(level), arr))

print(f"      {len(raw_lines)} raw contour segments before simplification")

# ── Step 3: RDP simplification + reproject to WGS84 ─────────────────────────

print(f"\n[3/4] Simplifying (RDP eps={RDP_EPS} m) and reprojecting to EPSG:4326...")

transformer = Transformer.from_crs(f"EPSG:{src_epsg}", "EPSG:4326", always_xy=True)

def reproject(coords_xy):
    """Convert [[x,y],...] from source CRS to [[lon,lat],...]."""
    xs_ = [c[0] for c in coords_xy]
    ys_ = [c[1] for c in coords_xy]
    lons, lats = transformer.transform(xs_, ys_)
    return [[round(ln, 7), round(lt, 7)] for ln, lt in zip(lons, lats)]

def seg_length_sq(arr):
    """Squared planar length of a polyline array (avoids sqrt for filtering)."""
    dx = arr[-1, 0] - arr[0, 0]
    dy = arr[-1, 1] - arr[0, 1]
    return dx*dx + dy*dy

# Minimum segment end-to-end distance to bother simplifying (metres²).
# Anything shorter than 2×RDP_EPS is sub-pixel noise — drop before touching Shapely.
MIN_LEN_SQ = (RDP_EPS * 2) ** 2

features = []
skipped  = 0
total    = len(raw_lines)
step     = max(1, total // 20)  # print progress every 5%

for i, (elev, arr) in enumerate(raw_lines):
    if i % step == 0:
        print(f"      {i}/{total} ({100*i//total}%)  features so far: {len(features)}")

    # Pre-filter: drop tiny noise segments without touching Shapely
    if len(arr) < MIN_PTS:
        skipped += 1
        continue
    if seg_length_sq(arr) < MIN_LEN_SQ:
        skipped += 1
        continue

    # RDP simplification in source-CRS metres (preserves sharp building corners)
    geom = LineString(arr).simplify(RDP_EPS, preserve_topology=False)
    if geom.is_empty or len(geom.coords) < MIN_PTS:
        skipped += 1
        continue
    coords_wgs = reproject(list(geom.coords))
    features.append({
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords_wgs},
        "properties": {"elevation": round(elev, 3)},
    })

print(f"      {len(features)} features kept  |  {skipped} removed (noise / simplification)")

# ── Step 4: write GeoJSON ────────────────────────────────────────────────────

print(f"\n[4/4] Writing {OUT_PATH.name}...")
with open(OUT_PATH, "w") as f:
    json.dump({"type": "FeatureCollection", "features": features}, f, separators=(",", ":"))

size_mb = OUT_PATH.stat().st_size / 1e6
print(f"      {len(features)} features  |  {size_mb:.1f} MB")

if size_mb > 50:
    print(f"\n[!] {size_mb:.0f} MB is too large for a Mapbox GeoJSON source.")
    print("    Convert to a vector tileset with tippecanoe:")
    print(f"    tippecanoe -o contours.mbtiles -l contours --drop-densest-as-needed {OUT_PATH.name}")
    print("    Then upload contours.mbtiles to Mapbox Studio.")
else:
    print("    File is small enough to upload directly to Mapbox as a GeoJSON tileset.")

print("\nDone.")
