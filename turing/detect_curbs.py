"""
detect_curbs.py — Extract curb / breakline edges from a DEM GeoTIFF.

Scans the elevation raster for vertical jumps of 3–6 inches (0.25–0.5 ft)
over a short horizontal span (≤ 0.5 ft).  Detected edges are vectorized to
GeoJSON LineString features with a barrier_height_ft attribute.

In the physics solver (run_flood_sim.py) these lines act as hard barriers
until water depth exceeds barrier_height_ft.

Usage (SLURM job):
    python detect_curbs.py \\
        --input  ./dem.tif \\
        --output ./curbs.geojson \\
        --min-height-jump 0.25 \\
        --max-height-jump 0.5  \\
        --max-horizontal-dist 0.5
"""

import argparse
import json
import sys

import numpy as np

try:
    import rasterio
    from rasterio.transform import xy
except ImportError:
    sys.exit("ERROR: rasterio not found. Run: pip install rasterio")

try:
    import scipy.ndimage as ndi
except ImportError:
    sys.exit("ERROR: scipy not found. Run: pip install scipy")

try:
    from skimage import measure
    from skimage.morphology import skeletonize
except ImportError:
    sys.exit("ERROR: scikit-image not found. Run: pip install scikit-image")


def compute_gradient_magnitude(dem: np.ndarray, pixel_size: float) -> np.ndarray:
    """Return gradient magnitude in ft/ft (slope), NaN where dem is NaN."""
    grad_x = ndi.sobel(dem, axis=1) / (8 * pixel_size)
    grad_y = ndi.sobel(dem, axis=0) / (8 * pixel_size)
    magnitude = np.sqrt(grad_x**2 + grad_y**2)
    magnitude[np.isnan(dem)] = np.nan
    return magnitude


def vectorize_skeleton(
    skeleton: np.ndarray,
    gradient: np.ndarray,
    transform,
    pixel_size: float,
    max_height_jump: float,
) -> list:
    """Convert skeleton binary array to GeoJSON Feature dicts."""
    contours = measure.find_contours(skeleton.astype(float), 0.5)
    features = []
    for contour in contours:
        if len(contour) < 2:
            continue
        coords = []
        heights = []
        for row, col in contour:
            r, c = int(round(row)), int(round(col))
            lon, lat = xy(transform, r, c)
            coords.append([float(lon), float(lat)])
            if 0 <= r < gradient.shape[0] and 0 <= c < gradient.shape[1]:
                g = gradient[r, c]
                if not np.isnan(g):
                    heights.append(float(g * pixel_size))

        if len(coords) < 2:
            continue

        barrier_h = float(np.median(heights)) if heights else 0.25
        barrier_h = round(min(barrier_h, max_height_jump), 3)

        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": coords,
            },
            "properties": {
                "barrier_height_ft": barrier_h,
            },
        })
    return features


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract curb/breakline edges from a DEM GeoTIFF"
    )
    parser.add_argument("--input",              required=True,
                        help="Path to input DEM GeoTIFF (dem.tif)")
    parser.add_argument("--output",             required=True,
                        help="Path to output GeoJSON")
    parser.add_argument("--min-height-jump",    type=float, default=0.25,
                        help="Minimum vertical jump to classify as a curb (ft, default 0.25 = 3in)")
    parser.add_argument("--max-height-jump",    type=float, default=0.5,
                        help="Maximum vertical jump — taller = wall, not curb (ft, default 0.5 = 6in)")
    parser.add_argument("--max-horizontal-dist", type=float, default=0.5,
                        help="Maximum horizontal span for the jump (ft, default 0.5)")
    args = parser.parse_args()

    print(f"[detect_curbs] input            : {args.input}")
    print(f"[detect_curbs] output           : {args.output}")
    print(f"[detect_curbs] height range     : {args.min_height_jump}–{args.max_height_jump} ft")
    print(f"[detect_curbs] max horiz. dist  : {args.max_horizontal_dist} ft")

    with rasterio.open(args.input) as src:
        dem = src.read(1).astype(float)
        nodata = src.nodata if src.nodata is not None else -9999.0
        dem[dem == nodata] = np.nan
        transform = src.transform
        crs = src.crs
        pixel_size = abs(float(transform.a))  # ft/pixel

    print(f"[detect_curbs] raster size      : {dem.shape[1]} x {dem.shape[0]} px")
    print(f"[detect_curbs] pixel size       : {pixel_size:.3f} ft")

    gradient = compute_gradient_magnitude(dem, pixel_size)

    # Gradient thresholds: slope = height_jump / horizontal_dist
    min_slope = args.min_height_jump / (pixel_size * args.max_horizontal_dist)
    max_slope = args.max_height_jump / pixel_size

    curb_mask = (gradient >= min_slope) & (gradient <= max_slope)
    curb_mask = np.nan_to_num(curb_mask, nan=0).astype(bool)

    # Thin to 1-pixel-wide skeleton before vectorizing
    skeleton = skeletonize(curb_mask)

    features = vectorize_skeleton(skeleton, gradient, transform, pixel_size, args.max_height_jump)

    geojson = {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": str(crs)},
        },
        "features": features,
    }

    with open(args.output, "w") as f:
        json.dump(geojson, f)

    print(f"[detect_curbs] detected segments: {len(features):,}")
    print("[detect_curbs] DONE")


if __name__ == "__main__":
    main()
