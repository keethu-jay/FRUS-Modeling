"""
Build public/data/vectors/curbs_web.geojson for the browser from a full curb export.

Place a **citywide** `curbs.geojson` (LiDAR curb mesh with `barrier_height_ft`) in
`public/data/vectors/`. The full file is large (~70 MB); this script decimates +
simplifies while preserving `barrier_height_ft` for lighter loads.

The web app defaults to `data/vectors/curbs.geojson` (full mesh). For dev, set
`VITE_CURBS_GEOJSON=data/vectors/curbs_web.geojson` in `.env` to use this output.

Usage:
  python frontend/scripts/clip_curbs_subset.py

Requires: geopandas (reads full file once; takes ~30–60 s).
"""
from __future__ import annotations

from pathlib import Path

import geopandas as gpd

SRC = Path(__file__).resolve().parent.parent / "public/data/vectors/curbs.geojson"
DST = Path(__file__).resolve().parent.parent / "public/data/vectors/curbs_web.geojson"

# Keep every Nth feature (geometry is repetitive mesh cells)
STRIDE = 4
# ~15 ft simplify in NYC — fewer vertices, still reads at street zoom
TOLERANCE_DEG = 4e-5


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source: {SRC}")
    print("Reading curbs.geojson (one-time load)...")
    gdf = gpd.read_file(SRC)
    if gdf.crs is None:
        gdf = gdf.set_crs(4326)
    else:
        gdf = gdf.to_crs(4326)

    gdf = gdf.iloc[::STRIDE].copy()
    gdf["geometry"] = gdf.geometry.simplify(TOLERANCE_DEG, preserve_topology=True)

    if "barrier_height_ft" in gdf.columns:
        gdf = gdf[["barrier_height_ft", "geometry"]]

    gdf.to_file(DST, driver="GeoJSON")
    mb = DST.stat().st_size / 1024 / 1024
    print(f"Wrote {DST} - features={len(gdf)}, size={mb:.2f} MB")


if __name__ == "__main__":
    main()
