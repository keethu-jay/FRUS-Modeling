#!/bin/bash
# [MILESTONE-2] Extract curb / breakline edges from dem.tif → curbs.geojson.
#
# Pre-requisite: dem.tif must exist (run lidar_dem.sh first).
#
# Output: ~/flood_env/curbs.geojson
# After job:
#   scp <turing>:~/flood_env/curbs.geojson \
#       FRUS-Modeling/frontend/public/data/vectors/curbs.geojson

#SBATCH --job-name="NYC_Curb_Detect"
#SBATCH --nodes=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32g
#SBATCH --partition=academic
#SBATCH --time=0-01:00:00
#SBATCH --output=logs/curb_detect_%j.out
#SBATCH --error=logs/curb_detect_%j.err

set -euo pipefail
mkdir -p logs

module load python/3.10
module load gdal
source ~/flood_env/bin/activate

INPUT="$HOME/flood_env/dem.tif"
OUTPUT="$HOME/flood_env/curbs.geojson"
REPO="$HOME/flood_env/FRUS-Modeling"

echo "[curb_detect] input  : $INPUT"
echo "[curb_detect] output : $OUTPUT"
echo "[curb_detect] start  : $(date)"

python "$REPO/turing/detect_curbs.py" \
    --input               "$INPUT" \
    --output              "$OUTPUT" \
    --min-height-jump     0.25 \
    --max-height-jump     0.5  \
    --max-horizontal-dist 0.5

echo "[curb_detect] done   : $(date)"
echo "[curb_detect] size   : $(du -sh $OUTPUT)"
