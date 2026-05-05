"""
Split a single shapefile .zip into multiple smaller .zip bundles for Mapbox Uploads
(~272 MB max per upload file on recent accounts).

Requires: geopandas, shapely (same stack as `turing/requirements.txt`).

Usage (from repo root):
  python frontend/scripts/split_shapefile_zip.py ^
    --input frontend/public/data/topo_vector.zip ^
    --out frontend/public/data/topo_chunks ^
    --parts 4

Outputs: topo_chunks/topo_vector_part01.zip, part02.zip, ...
"""
from __future__ import annotations

import argparse
import math
import tempfile
import zipfile
from pathlib import Path

import geopandas as gpd


def find_shp_in_dir(d: Path) -> Path:
    shps = sorted(d.glob("*.shp"))
    if len(shps) != 1:
        raise SystemExit(f"Expected exactly one .shp under extracted zip, got {[p.name for p in shps]}")
    return shps[0]


def load_from_zip(zip_path: Path) -> gpd.GeoDataFrame:
    with tempfile.TemporaryDirectory() as td:
        td_path = Path(td)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(td_path)
        shp = find_shp_in_dir(td_path)
        gdf = gpd.read_file(shp)
    return gdf


def write_shapefile_zip(gdf: gpd.GeoDataFrame, zip_path: Path, stem: str) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as work:
        w = Path(work)
        shp_fp = w / f"{stem}.shp"
        gdf.to_file(shp_fp, driver="ESRI Shapefile")
        # Collect sidecar files (.dbf .shx .prj .cpg …)
        paths = sorted(w.glob(f"{stem}.*"))
        if not paths:
            raise RuntimeError(f"No files written for stem {stem}")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zout:
            for p in paths:
                zout.write(p, arcname=p.name)


def main() -> None:
    ap = argparse.ArgumentParser(description="Split a shapefile zip into smaller zips.")
    ap.add_argument("--input", type=Path, required=True, help="Input .zip containing one shapefile set")
    ap.add_argument("--out", type=Path, required=True, help="Output directory for part*.zip files")
    ap.add_argument("--parts", type=int, default=4, help="Number of chunks (default 4)")
    args = ap.parse_args()

    inp: Path = args.input
    out_dir: Path = args.out
    parts: int = args.parts

    if parts < 2:
        raise SystemExit("--parts must be at least 2")
    if not inp.is_file():
        raise SystemExit(f"Missing input: {inp}")

    print(f"Reading {inp} …")
    gdf = load_from_zip(inp)
    n = len(gdf)
    print(f"Features: {n}, CRS: {gdf.crs}")

    chunk_size = max(1, math.ceil(n / parts))
    base = inp.stem  # topo_vector

    out_dir.mkdir(parents=True, exist_ok=True)
    part_idx = 0
    for i in range(0, n, chunk_size):
        part_idx += 1
        chunk = gdf.iloc[i : i + chunk_size].copy()
        stem = f"{base}_part{part_idx:02d}"
        zip_path = out_dir / f"{stem}.zip"
        print(f"Writing {zip_path.name} ({len(chunk)} features) …")
        write_shapefile_zip(chunk, zip_path, stem)

    print(f"Done. {part_idx} files in {out_dir.resolve()}")


if __name__ == "__main__":
    main()
