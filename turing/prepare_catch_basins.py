"""
prepare_catch_basins.py — Rasterize NYCDEP catch basin points to a sink mask.

Reads the raw NYCDEP GeoJSON (point_x / point_y in EPSG:2263 feet), aligns
each point to the DEM grid, and writes a uint8 GeoTIFF where 1 = catch basin
cell and 0 = no basin.  The output is consumed by run_flood_sim.py
--catch-basins as a drainage sink raster.

Usage:
    python prepare_catch_basins.py \\
        --geojson  NYCDEP_Citywide_Catch_Basins_20260430.geojson \\
        --dem      dem.tif \\
        --output   catch_basin_sinks.tif
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

try:
    import rasterio
    from rasterio.transform import rowcol
except ImportError:
    sys.exit("ERROR: rasterio not found — pip install rasterio")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rasterize NYCDEP catch basins onto the DEM grid"
    )
    parser.add_argument("--geojson", required=True,
                        help="Raw NYCDEP GeoJSON with point_x / point_y properties")
    parser.add_argument("--dem",     required=True,
                        help="DEM GeoTIFF (sets grid extent, resolution, CRS)")
    parser.add_argument("--output",  default="catch_basin_sinks.tif")
    args = parser.parse_args()

    print(f"[prep_cb] Reading DEM: {args.dem}")
    with rasterio.open(args.dem) as src:
        profile   = src.profile.copy()
        transform = src.transform
        nrows, ncols = src.height, src.width

    sink = np.zeros((nrows, ncols), dtype=np.uint8)

    print(f"[prep_cb] Loading GeoJSON: {args.geojson}")
    with open(args.geojson, "r", encoding="utf-8") as f:
        gj = json.load(f)

    features = gj.get("features", [])
    print(f"[prep_cb] {len(features)} features found")

    placed = skipped = 0
    for feat in features:
        props = feat.get("properties") or {}
        px = props.get("point_x")
        py = props.get("point_y")
        if px is None or py is None:
            # Fall back to GeoJSON geometry (WGS84) — only works if DEM is also WGS84
            geom = feat.get("geometry") or {}
            coords = geom.get("coordinates")
            if not coords:
                skipped += 1
                continue
            px, py = coords[0], coords[1]

        try:
            row, col = rowcol(transform, float(px), float(py))
        except Exception:
            skipped += 1
            continue

        if 0 <= row < nrows and 0 <= col < ncols:
            sink[row, col] = 1
            placed += 1
        else:
            skipped += 1

    print(f"[prep_cb] Placed: {placed}  Out-of-bounds: {skipped}")

    profile.update(dtype="uint8", count=1, nodata=None,
                   compress="lzw", tiled=True, blockxsize=256, blockysize=256)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(args.output, "w", **profile) as dst:
        dst.write(sink, 1)

    print(f"[prep_cb] Written: {args.output}  ({sink.sum()} sink cells)")


if __name__ == "__main__":
    main()
