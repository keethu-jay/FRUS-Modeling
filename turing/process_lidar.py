"""
process_lidar.py — Convert .LAZ point cloud to DEM GeoTIFF.

Uses PDAL to filter ground-classified returns (class 2) and rasterize to
a single-band GeoTIFF where pixel value = elevation in feet.

Usage (SLURM job):
    python process_lidar.py \\
        --input  ./nyc_lidar.laz \\
        --output ./dem.tif \\
        --resolution 1.0 \\
        --crs EPSG:2263
"""

import argparse
import json
import sys
import numpy as np

try:
    import pdal
except ImportError:
    sys.exit("ERROR: pdal not found. Run: pip install pdal  (module load pdal on Turing)")

try:
    import rasterio
except ImportError:
    sys.exit("ERROR: rasterio not found. Run: pip install rasterio")


def build_pipeline(input_path: str, output_path: str, resolution: float, crs: str) -> dict:
    return {
        "pipeline": [
            {
                "type": "readers.las",
                "filename": input_path,
            },
            {
                # Keep only ground-classified returns (ASPRS class 2)
                "type": "filters.range",
                "limits": "Classification[2:2]",
            },
            {
                # Reproject to target CRS if needed
                "type": "filters.reprojection",
                "out_srs": crs,
            },
            {
                # Rasterize: mean elevation in feet per cell
                "type": "writers.gdal",
                "filename": output_path,
                "resolution": resolution,
                "output_type": "mean",
                "data_type": "float32",
                "nodata": -9999.0,
                "override_srs": crs,
                "gdalopts": "COMPRESS=LZW,TILED=YES,BLOCKXSIZE=256,BLOCKYSIZE=256",
            },
        ]
    }


def log_stats(output_path: str) -> None:
    with rasterio.open(output_path) as src:
        data = src.read(1)
        nodata = src.nodata if src.nodata is not None else -9999.0
        valid = data[data != nodata]
        if valid.size == 0:
            print("WARNING: output raster contains only nodata pixels")
            return
        coverage = 1.0 - (data == nodata).sum() / data.size
        print(f"  Min elevation : {float(valid.min()):.2f} ft")
        print(f"  Max elevation : {float(valid.max()):.2f} ft")
        print(f"  Mean elevation: {float(valid.mean()):.2f} ft")
        print(f"  Data coverage : {coverage:.1%}")
        print(f"  Raster size   : {src.width} x {src.height} px")
        print(f"  Pixel size    : {abs(src.transform.a):.2f} ft")
        print(f"  Output CRS    : {src.crs}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert a .LAZ point cloud to a ground-elevation DEM GeoTIFF"
    )
    parser.add_argument("--input",      required=True,  help="Path to input .LAZ / .LAS file")
    parser.add_argument("--output",     required=True,  help="Path to output DEM GeoTIFF")
    parser.add_argument("--resolution", type=float, default=1.0,
                        help="Grid resolution in CRS units (default: 1.0 ft for EPSG:2263)")
    parser.add_argument("--crs",        default="EPSG:2263",
                        help="Output CRS as EPSG code (default: EPSG:2263 NY State Plane ft)")
    args = parser.parse_args()

    print(f"[process_lidar] input      : {args.input}")
    print(f"[process_lidar] output     : {args.output}")
    print(f"[process_lidar] resolution : {args.resolution} ft")
    print(f"[process_lidar] CRS        : {args.crs}")

    pipeline_def = build_pipeline(args.input, args.output, args.resolution, args.crs)
    pipeline = pdal.Pipeline(json.dumps(pipeline_def))

    print("[process_lidar] executing PDAL pipeline…")
    count = pipeline.execute()
    print(f"[process_lidar] processed {count:,} points")

    print("[process_lidar] output stats:")
    log_stats(args.output)
    print("[process_lidar] DONE")


if __name__ == "__main__":
    main()
