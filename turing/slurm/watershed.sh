#!/bin/bash
# [MILESTONE-3] Marker-controlled watershed transform.
# Combines dem.tif + final_mask.tif + curbs.geojson → watershed_basins.tif
#
# Pre-requisites: dem.tif and curbs.geojson must exist.
#
# Output: ~/flood_env/watershed_basins.tif
#         ~/flood_env/watershed_basins_stats.csv

#SBATCH --job-name="NYC_Watershed"
#SBATCH --nodes=1
#SBATCH --cpus-per-task=16
#SBATCH --mem=64g
#SBATCH --partition=academic
#SBATCH --gres=gpu:1
#SBATCH --constraint="A30"
#SBATCH --time=0-03:00:00
#SBATCH --output=logs/watershed_%j.out
#SBATCH --error=logs/watershed_%j.err

set -euo pipefail
mkdir -p logs

module load python/3.10
module load gdal
source ~/flood_env/bin/activate

DEM="$HOME/flood_env/dem.tif"
MASK="$HOME/flood_env/final_mask.tif"
CURBS="$HOME/flood_env/curbs.geojson"
OUTPUT="$HOME/flood_env/watershed_basins.tif"
REPO="$HOME/flood_env/FRUS-Modeling"

echo "[watershed] dem    : $DEM"
echo "[watershed] mask   : $MASK"
echo "[watershed] curbs  : $CURBS"
echo "[watershed] output : $OUTPUT"
echo "[watershed] start  : $(date)"

python "$REPO/turing/run_watershed.py" \
    --dem    "$DEM"    \
    --mask   "$MASK"   \
    --curbs  "$CURBS"  \
    --output "$OUTPUT"

echo "[watershed] done   : $(date)"
echo "[watershed] size   : $(du -sh $OUTPUT)"
