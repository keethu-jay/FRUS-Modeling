"""
build_recommender.py — Bioswale / green-infrastructure site recommender.

Identifies candidate locations for bioswales by intersecting:
  1. Flood depth > 0.5 ft  (chronic pooling)
  2. Permeability = 0       (impermeable surface — concrete/asphalt)
  3. Watershed catchment area > threshold (large drainage contribution)

Candidate pixels are clustered with DBSCAN and the centroid of each
cluster is output as a GeoJSON Point feature with priority metadata.

Output: bioswale_recommendations.geojson (top 100 candidates)

Usage:
    python build_recommender.py \\
        --flood-dir    ./flood_outputs/ \\
        --mask         ./final_mask.tif \\
        --basins       ./watershed_basins.tif \\
        --rainfall     3 \\
        --timestep     60 \\
        --output       ./bioswale_recommendations.geojson \\
        --top-n        100
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
    from sklearn.cluster import DBSCAN
except ImportError:
    sys.exit("ERROR: scikit-learn not found. Run: pip install scikit-learn")


MIN_DEPTH_FT   = 0.5    # minimum pooling depth to consider
MIN_BASIN_AREA = 5000   # minimum catchment area in pixels (~5000 sq ft at 1ft resolution)


def load_raster(path: str) -> tuple[np.ndarray, object, object]:
    with rasterio.open(path) as src:
        data      = src.read(1).astype(float)
        nodata    = src.nodata if src.nodata is not None else -9999.0
        transform = src.transform
        crs       = src.crs
    data[data == nodata] = np.nan
    return data, transform, crs


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Identify optimal bioswale installation sites from flood outputs"
    )
    parser.add_argument("--flood-dir",  required=True,
                        help="Directory containing flood GeoTIFFs from run_flood_sim.py")
    parser.add_argument("--mask",       required=True,
                        help="Binary permeability GeoTIFF (final_mask.tif)")
    parser.add_argument("--basins",     required=True,
                        help="Labeled watershed basins GeoTIFF")
    parser.add_argument("--rainfall",   type=int, default=3,
                        help="Rainfall scenario (1, 2, or 3 inches)")
    parser.add_argument("--timestep",   type=int, default=60,
                        help="Timestep in minutes to analyse")
    parser.add_argument("--output",     required=True,
                        help="Output GeoJSON path")
    parser.add_argument("--top-n",      type=int, default=100,
                        help="Maximum number of output candidate sites")
    args = parser.parse_args()

    flood_tif = f"{args.flood_dir}/flood_{args.rainfall}in_{args.timestep}min.tif"
    print(f"[recommender] flood    : {flood_tif}")
    print(f"[recommender] mask     : {args.mask}")
    print(f"[recommender] basins   : {args.basins}")

    depth,  t_flood,  crs  = load_raster(flood_tif)
    perm,   _,         _   = load_raster(args.mask)
    basins, _,         _   = load_raster(args.basins)

    # Basin area lookup (pixel counts)
    basin_ids, basin_counts = np.unique(basins[~np.isnan(basins)], return_counts=True)
    basin_area = dict(zip(basin_ids.astype(int), basin_counts.astype(int)))

    # Candidate mask: deep pooling on impermeable surface in a large catchment
    candidate_mask = (
        (depth > MIN_DEPTH_FT)
        & (perm == 0)
        & (~np.isnan(depth))
    )

    # Apply basin size filter
    basin_int = basins.astype(float)
    basin_int[np.isnan(basins)] = -1
    large_basin = np.vectorize(lambda b: basin_area.get(int(b), 0) >= MIN_BASIN_AREA)(basin_int)
    candidate_mask &= large_basin

    rows, cols = np.where(candidate_mask)
    if len(rows) == 0:
        print("[recommender] No candidate pixels found — try lowering thresholds")
        geojson = {"type": "FeatureCollection", "features": []}
        with open(args.output, "w") as f:
            json.dump(geojson, f)
        return

    print(f"[recommender] candidate pixels: {len(rows):,}")

    # Convert row/col to geographic coordinates for clustering
    xs = np.array([xy(t_flood, r, c)[0] for r, c in zip(rows, cols)])
    ys = np.array([xy(t_flood, r, c)[1] for r, c in zip(rows, cols)])
    coords = np.column_stack([xs, ys])

    # DBSCAN clustering (eps = 50 ft radius, min 5 pixels per cluster)
    db = DBSCAN(eps=50, min_samples=5).fit(coords)
    labels = db.labels_
    n_clusters = int(labels.max()) + 1
    print(f"[recommender] DBSCAN clusters : {n_clusters:,}")

    # Compute cluster priority: mean depth × basin area
    clusters = []
    for label in range(n_clusters):
        sel = labels == label
        if sel.sum() < 5:
            continue
        cx = float(xs[sel].mean())
        cy = float(ys[sel].mean())
        mean_depth = float(depth[rows[sel], cols[sel]].mean())
        median_basin = int(np.median(basins[rows[sel], cols[sel]]))
        area = basin_area.get(median_basin, 0)
        priority = mean_depth * area
        clusters.append({
            "lng": cx, "lat": cy,
            "mean_depth_ft": round(mean_depth, 3),
            "catchment_area_px": area,
            "pixel_count": int(sel.sum()),
            "priority_score": round(priority, 1),
        })

    # Sort by priority and take top N
    clusters.sort(key=lambda x: x["priority_score"], reverse=True)
    top = clusters[: args.top_n]

    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [c["lng"], c["lat"]]},
            "properties": {
                "mean_depth_ft":     c["mean_depth_ft"],
                "catchment_area_px": c["catchment_area_px"],
                "pixel_count":       c["pixel_count"],
                "priority_score":    c["priority_score"],
                "rainfall_in":       args.rainfall,
                "timestep_min":      args.timestep,
            },
        }
        for c in top
    ]

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": str(crs)}},
        "features": features,
    }

    with open(args.output, "w") as f:
        json.dump(geojson, f, indent=2)

    print(f"[recommender] output {len(features)} bioswale candidates → {args.output}")
    print("[recommender] DONE")


if __name__ == "__main__":
    main()
