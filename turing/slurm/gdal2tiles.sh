#!/bin/bash
# [MILESTONE-0] Re-run permeability tile generation if gdal2tiles crashed.
# Input:  ~/flood_env/final_mask.tif
# Output: ~/flood_env/permeability_tiles/{z}/{x}/{y}.png
#
# After job completes:
#   rsync -av ~/flood_env/permeability_tiles/ \
#         <local>:FRUS-Modeling/frontend/public/data/permeability/

#SBATCH --job-name="NYC_Perim_Tiles"
#SBATCH --nodes=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32g
#SBATCH --partition=academic
#SBATCH --time=0-01:00:00
#SBATCH --output=logs/gdal2tiles_%j.out
#SBATCH --error=logs/gdal2tiles_%j.err

set -euo pipefail
mkdir -p logs

module load python/3.10
module load gdal
source ~/flood_env/bin/activate

INPUT="$HOME/flood_env/final_mask.tif"
OUTPUT_DIR="$HOME/flood_env/permeability_tiles"

echo "[gdal2tiles] input  : $INPUT"
echo "[gdal2tiles] output : $OUTPUT_DIR"
echo "[gdal2tiles] start  : $(date)"

gdal2tiles.py \
    --zoom=10-18 \
    --processes=8 \
    --resampling=near \
    --webviewer=none \
    "$INPUT" \
    "$OUTPUT_DIR"

echo "[gdal2tiles] done   : $(date)"
echo "[gdal2tiles] tiles  : $(find $OUTPUT_DIR -name '*.png' | wc -l) PNG files"
