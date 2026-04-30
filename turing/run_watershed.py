"""
run_watershed.py — Marker-Controlled Watershed Transform.

Combines dem.tif (elevation) and final_mask.tif (NDVI permeability) to
produce a labeled catchment-basin raster.

Cost function:
    cost = (max_elev - dem) * (1.0 - 0.8 * ndvi_mask)
    → concrete (ndvi=0): cost = full inverted elevation  → fast flow
    → grass   (ndvi=1): cost = 0.2x inverted elevation  → slow flow

Curb lines (curbs.geojson) are burned as near-infinite barriers in the
cost raster before watershed segmentation.

Output: watershed_basins.tif + watershed_basins_stats.csv

Usage (SLURM job):
    python run_watershed.py \\
        --dem    ./dem.tif \\
        --mask   ./final_mask.tif \\
        --curbs  ./curbs.geojson \\
        --output ./watershed_basins.tif
"""

import argparse
import csv
import json
import os
import subprocess
import sys
import tempfile

import numpy as np

try:
    import rasterio
    from rasterio.features import rasterize as rio_rasterize
    from rasterio.transform import from_bounds
except ImportError:
    sys.exit("ERROR: rasterio not found. Run: pip install rasterio")

try:
    from scipy import ndimage
except ImportError:
    sys.exit("ERROR: scipy not found. Run: pip install scipy")

try:
    from skimage.segmentation import watershed
    from skimage.feature import peak_local_max
except ImportError:
    sys.exit("ERROR: scikit-image not found. Run: pip install scikit-image")


def coregister_dem(dem_path: str, ref_path: str, out_path: str) -> None:
    """Reproject and resample DEM to exactly match the reference raster grid."""
    with rasterio.open(ref_path) as ref:
        crs   = ref.crs.to_string()
        left, bottom, right, top = ref.bounds
        width, height = ref.width, ref.height

    cmd = [
        "gdalwarp",
        "-t_srs", crs,
        "-te", str(left), str(bottom), str(right), str(top),
        "-ts", str(width), str(height),
        "-r", "bilinear",
        "-of", "GTiff",
        dem_path, out_path,
    ]
    print(f"[run_watershed] coregistering DEM: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)


def burn_curbs(cost: np.ndarray, transform, curbs_path: str) -> np.ndarray:
    """Burn curb LineString features as high-cost barriers in the cost raster."""
    import json as _json
    with open(curbs_path) as f:
        gj = _json.load(f)

    shapes = [
        (feat["geometry"], 1e9)
        for feat in gj.get("features", [])
        if feat.get("geometry", {}).get("type") == "LineString"
    ]
    if not shapes:
        return cost

    barrier = rio_rasterize(
        shapes,
        out_shape=cost.shape,
        transform=transform,
        fill=0,
        dtype="float32",
    )
    cost[barrier > 0] = 1e9
    print(f"[run_watershed] burned {len(shapes):,} curb segments as barriers")
    return cost


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Marker-controlled watershed transform for NYC flood basin delineation"
    )
    parser.add_argument("--dem",    required=True, help="DEM GeoTIFF (elevation in ft)")
    parser.add_argument("--mask",   required=True, help="Binary permeability GeoTIFF (0/1)")
    parser.add_argument("--curbs",  default=None,  help="Curb LineString GeoJSON (optional)")
    parser.add_argument("--output", required=True, help="Output labeled basin GeoTIFF")
    args = parser.parse_args()

    print(f"[run_watershed] dem    : {args.dem}")
    print(f"[run_watershed] mask   : {args.mask}")
    print(f"[run_watershed] curbs  : {args.curbs or 'none'}")
    print(f"[run_watershed] output : {args.output}")

    # Co-register DEM to mask grid (same CRS, extent, resolution)
    tmp_dem = tempfile.mktemp(suffix="_dem_coreg.tif")
    try:
        coregister_dem(args.dem, args.mask, tmp_dem)

        with rasterio.open(tmp_dem) as src:
            dem     = src.read(1).astype(float)
            nodata  = src.nodata if src.nodata is not None else -9999.0
            profile = src.profile.copy()
            transform = src.transform

        with rasterio.open(args.mask) as src:
            ndvi = src.read(1).astype(float)

        # NaN mask
        invalid = (dem == nodata) | np.isnan(dem)
        dem[invalid] = 0

        # Build cost surface: inverted DEM weighted by permeability
        max_elev = dem[~invalid].max() if (~invalid).any() else 0
        inverted = max_elev - dem
        cost = inverted * (1.0 - 0.8 * np.clip(ndvi, 0, 1))

        # Burn curb barriers
        if args.curbs and os.path.exists(args.curbs):
            cost = burn_curbs(cost, transform, args.curbs)

        # Mask invalid pixels
        cost[invalid] = np.nan

        # Auto-detect minima (seed markers) using local minimum search
        cost_clean = np.nan_to_num(cost, nan=cost[~np.isnan(cost)].max() + 1)
        local_min  = peak_local_max(-cost_clean, min_distance=30, exclude_border=False)
        markers    = np.zeros(cost.shape, dtype=np.int32)
        for idx, (r, c) in enumerate(local_min):
            markers[r, c] = idx + 1
        markers = ndimage.label(markers)[0]

        print(f"[run_watershed] found {markers.max():,} watershed markers")

        # Watershed segmentation
        labels = watershed(cost_clean, markers, mask=~invalid)

        # Save labeled raster
        out_profile = profile.copy()
        out_profile.update(dtype="int32", count=1, nodata=-1)
        with rasterio.open(args.output, "w", **out_profile) as dst:
            labels_out = labels.astype(np.int32)
            labels_out[invalid] = -1
            dst.write(labels_out, 1)

        # Write basin stats CSV
        stats_path = args.output.replace(".tif", "_stats.csv")
        pixel_area = abs(float(transform.a) * float(transform.e))
        unique, counts = np.unique(labels[~invalid], return_counts=True)
        with open(stats_path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["basin_id", "pixel_count", "area_sq_ft"])
            for basin_id, count in zip(unique, counts):
                writer.writerow([int(basin_id), int(count), round(int(count) * pixel_area, 1)])

        print(f"[run_watershed] delineated {len(unique):,} basins → {args.output}")
        print(f"[run_watershed] basin stats → {stats_path}")

    finally:
        if os.path.exists(tmp_dem):
            os.unlink(tmp_dem)

    print("[run_watershed] DONE")


if __name__ == "__main__":
    main()
