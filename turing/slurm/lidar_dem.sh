#!/bin/bash
# [MILESTONE-1] Convert NYC LiDAR .LAZ point cloud → DEM GeoTIFF.
#
# Pre-requisite: download nyc_lidar.laz from NOAA Digital Coast cart
#   cd ~/flood_env && wget <LAZ_BULK_DOWNLOAD_URL> -O nyc_lidar.laz
#   Verify: las2las --input nyc_lidar.laz --stats
#
# Output: ~/flood_env/dem.tif  (EPSG:2263, 1ft resolution, float32)
# If CRS mismatch with final_mask.tif, reproject:
#   gdalwarp -t_srs EPSG:4326 dem.tif dem_reprojected.tif

#SBATCH --job-name="NYC_LiDAR_DEM"
#SBATCH --nodes=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=64g
#SBATCH --partition=academic
#SBATCH --gres=gpu:1
#SBATCH --constraint="A30"
#SBATCH --time=0-02:00:00
#SBATCH --output=logs/lidar_dem_%j.out
#SBATCH --error=logs/lidar_dem_%j.err

set -euo pipefail
mkdir -p logs

module load python/3.10
module load pdal
module load gdal
source ~/flood_env/bin/activate

INPUT="$HOME/flood_env/nyc_lidar.laz"
OUTPUT="$HOME/flood_env/dem.tif"
REPO="$HOME/flood_env/FRUS-Modeling"

echo "[lidar_dem] input  : $INPUT"
echo "[lidar_dem] output : $OUTPUT"
echo "[lidar_dem] start  : $(date)"

python "$REPO/turing/process_lidar.py" \
    --input      "$INPUT" \
    --output     "$OUTPUT" \
    --resolution 1.0 \
    --crs        EPSG:2263

echo "[lidar_dem] done   : $(date)"

# Validate CRS matches final_mask.tif
MASK_CRS=$(gdalinfo "$HOME/flood_env/final_mask.tif" | grep -i "EPSG" | head -1)
DEM_CRS=$(gdalinfo  "$OUTPUT"                         | grep -i "EPSG" | head -1)
echo "[lidar_dem] mask CRS : $MASK_CRS"
echo "[lidar_dem] dem  CRS : $DEM_CRS"

# Reproject if needed (edit target CRS to match mask)
# gdalwarp -t_srs EPSG:4326 "$OUTPUT" "${OUTPUT%.tif}_reprojected.tif"
