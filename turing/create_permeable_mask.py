"""
Build a binary permeability mask from a 4-band GeoTIFF (Red + NIR) using NDVI.

Typical use on Turing: run after unzipping orthophoto / multispectral rasters.
"""

import argparse
import os

import numpy as np
import rasterio


def create_mask(input_path: str, output_path: str) -> None:
    with rasterio.open(input_path) as src:
        # Read Red (Band 1) and Near-Infrared (Band 4)
        red = src.read(1).astype("float32")
        nir = src.read(4).astype("float32")

        # NDVI: (NIR - Red) / (NIR + Red); epsilon avoids divide-by-zero
        ndvi = (nir - red) / (nir + red + 1e-10)

        # Binary mask: 1 = permeable (vegetation), 0 = impermeable
        # NDVI > 0.3 is a common vegetation threshold (tune for your scene)
        mask = (ndvi > 0.3).astype("uint8")

        profile = src.profile
        profile.update(dtype=rasterio.uint8, count=1)
        with rasterio.open(output_path, "w", **profile) as dst:
            dst.write(mask, 1)

    print(f"Mask saved to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Create permeable/impermeable mask from 4-band raster (NDVI threshold)."
    )
    parser.add_argument(
        "--input",
        type=str,
        required=True,
        help="Path to input GeoTIFF (at least 4 bands: band1=Red, band4=NIR).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="permeable_mask.tif",
        help="Output single-band uint8 GeoTIFF path.",
    )
    args = parser.parse_args()
    create_mask(args.input, args.output)
