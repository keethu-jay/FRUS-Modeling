#!/bin/bash
# [MILESTONE-4] 2D Shallow Water Equations flood simulation (MPI + OpenMP).
#
# Runs all 3 rainfall scenarios (1in, 2in, 3in) sequentially, each producing
# 8 timestep GeoTIFFs + XYZ tile trees for the frontend.
#
# Pre-requisites: dem.tif, final_mask.tif, watershed_basins.tif must exist.
# Catch basins: run prepare_catch_basins.py once before this job:
#   python turing/prepare_catch_basins.py \
#       --geojson NYCDEP_Citywide_Catch_Basins_20260430.geojson \
#       --dem     ~/flood_env/dem.tif \
#       --output  ~/flood_env/catch_basin_sinks.tif
#
# Output tiles: ~/flood_env/flood_outputs/{n}in_{t}min/{z}/{x}/{y}.png
# After job, rsync to frontend:
#   rsync -av ~/flood_env/flood_outputs/ \
#         <local>:FRUS-Modeling/frontend/public/data/flood/

#SBATCH --job-name="NYC_FloodSim"
#SBATCH --nodes=2
#SBATCH --ntasks-per-node=8
#SBATCH --cpus-per-task=4
#SBATCH --mem=128g
#SBATCH --partition=academic
#SBATCH --gres=gpu:2
#SBATCH --constraint="A30"
#SBATCH --time=0-06:00:00
#SBATCH --output=logs/flood_sim_%j.out
#SBATCH --error=logs/flood_sim_%j.err

set -euo pipefail
mkdir -p logs

module load python/3.10
module load gdal
module load openmpi
source ~/flood_env/bin/activate

DEM="$HOME/flood_env/dem.tif"
MASK="$HOME/flood_env/final_mask.tif"
BASINS="$HOME/flood_env/watershed_basins.tif"
SINKS="$HOME/flood_env/catch_basin_sinks.tif"
OUT_DIR="$HOME/flood_env/flood_outputs"
REPO="$HOME/flood_env/FRUS-Modeling"
TIMESTEPS="0,5,10,15,20,30,45,60"

mkdir -p "$OUT_DIR"

for RAIN in 1 2 3; do
    echo "========================================"
    echo "[flood_sim] rainfall=${RAIN}in  start=$(date)"
    echo "========================================"
    mpirun -np 16 python "$REPO/turing/run_flood_sim.py" \
        --dem           "$DEM"    \
        --mask          "$MASK"   \
        --basins        "$BASINS" \
        --catch-basins  "$SINKS"  \
        --rainfall      $RAIN     \
        --duration      60        \
        --timesteps     "$TIMESTEPS" \
        --output-dir    "$OUT_DIR"
    echo "[flood_sim] rainfall=${RAIN}in  done=$(date)"
done

echo "[flood_sim] all scenarios complete: $(date)"
echo "[flood_sim] output size: $(du -sh $OUT_DIR)"
echo "[flood_sim] tile count : $(find $OUT_DIR -name '*.png' | wc -l)"
