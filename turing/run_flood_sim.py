"""
run_flood_sim.py — 2D Shallow Water Equations (SWE) flood simulator.

Uses mpi4py for domain decomposition across cluster nodes (row-striped).

Physics:
    dh/dt  = -∇·(h u)
    du_x/dt = -g ∂h/∂x  - g n² |u| u_x / h^(4/3)   (Manning friction)
    du_y/dt = -g ∂h/∂y  - g n² |u| u_y / h^(4/3)

CFL safety: dt = min(dt_target, 0.5 * dx / (√(g h_max) + |u_max|))

Manning's roughness:
    n = 0.013  →  concrete  (mask = 0)
    n = 0.035  →  grass     (mask = 1)

Output per timestep: flood_{n}in_{t}min.tif + XYZ tiles under output-dir/

Usage (SLURM + mpirun):
    mpirun -np 16 python run_flood_sim.py \\
        --dem           ./dem.tif \\
        --mask          ./final_mask.tif \\
        --basins        ./watershed_basins.tif \\
        --catch-basins  ./catch_basin_sinks.tif \\
        --rainfall      3.0 \\
        --duration      60 \\
        --timesteps     0,5,10,15,20,30,45,60 \\
        --output-dir    ./flood_outputs/

Catch-basin sink model:
    Each catch basin drains DRAIN_RATE_FT_S feet of water per second from its
    grid cell, applied as a negative source term after each SWE sub-step.
    Cells without a basin are unaffected.  The raster is produced by
    prepare_catch_basins.py from the NYCDEP GeoJSON.
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

try:
    import rasterio
except ImportError:
    sys.exit("ERROR: rasterio not found. Run: pip install rasterio")

try:
    from mpi4py import MPI
except ImportError:
    sys.exit("ERROR: mpi4py not found. Run: pip install mpi4py  (module load openmpi on Turing)")

# Gravity in ft/s²
G = 32.174

# Drainage rate per catch basin cell (ft of water removed per second).
# A typical NYC catch basin handles ~0.01 cfs/ft², equivalent to ~0.01 ft/s
# of depth reduction at the 1-ft grid resolution.
DRAIN_RATE_FT_S = 0.01


# ── Color encoding ────────────────────────────────────────────────────────────

def depth_to_rgba(h: np.ndarray) -> np.ndarray:
    """
    Encode water depth (ft) as RGBA per PRD §7.3:
      0 depth       → transparent
      0–0.5 ft      → blue gradient   (low risk)
      0.5–2.0 ft    → yellow-orange   (medium risk)
      > 2.0 ft      → red             (critical)
    """
    rgba = np.zeros((*h.shape, 4), dtype=np.uint8)

    m_dry  = h <= 0
    m_low  = (h > 0)   & (h <= 0.5)
    m_med  = (h > 0.5) & (h <= 2.0)
    m_crit = h > 2.0

    # Dry: fully transparent
    rgba[m_dry] = [0, 0, 0, 0]

    # Low risk: light-blue → deeper blue
    t = np.clip(h[m_low] / 0.5, 0, 1)
    rgba[m_low, 0] = (30  + 60  * (1 - t)).astype(np.uint8)
    rgba[m_low, 1] = (100 + 80  * (1 - t)).astype(np.uint8)
    rgba[m_low, 2] = (200 + 55  * t      ).astype(np.uint8)
    rgba[m_low, 3] = (80  + 120 * t      ).astype(np.uint8)

    # Medium risk: yellow → orange
    t = np.clip((h[m_med] - 0.5) / 1.5, 0, 1)
    rgba[m_med, 0] = (247              ).astype(np.uint8)
    rgba[m_med, 1] = (183 - 183 * t   ).astype(np.uint8)
    rgba[m_med, 2] = (32  * (1 - t)   ).astype(np.uint8)
    rgba[m_med, 3] = (180 + 55  * t   ).astype(np.uint8)

    # Critical: persimmon red
    rgba[m_crit] = [243, 89, 0, 235]

    return rgba


def save_flood_tif(h: np.ndarray, profile: dict, output_path: str) -> None:
    """Write depth raster as float32 GeoTIFF with LZW compression."""
    out = profile.copy()
    out.update(dtype="float32", count=1, nodata=-9999.0,
               compress="lzw", tiled=True, blockxsize=256, blockysize=256)
    with rasterio.open(output_path, "w", **out) as dst:
        arr = h.astype(np.float32)
        arr[arr < 0] = 0
        dst.write(arr, 1)


def generate_tiles(tif_path: str, tile_dir: str, zoom: str = "10-18") -> None:
    """Run gdal2tiles.py to produce XYZ PNG tiles."""
    cmd = [
        "gdal2tiles.py",
        "--zoom", zoom,
        "--processes=8",
        "--resampling=near",
        "--webviewer=none",
        tif_path,
        tile_dir,
    ]
    subprocess.run(cmd, check=True)


# ── SWE solver ────────────────────────────────────────────────────────────────

def manning_n(mask: np.ndarray) -> np.ndarray:
    return np.where(mask == 0, 0.013, 0.035)


def swe_step(
    h: np.ndarray,
    ux: np.ndarray,
    uy: np.ndarray,
    n: np.ndarray,
    dx: float,
    dy: float,
    dt: float,
    barrier: np.ndarray,
    wet: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """One explicit Euler step of the 2D SWE."""
    h = np.maximum(h, 0.0)

    # Central-difference divergence of flux
    hux = h * ux
    huy = h * uy
    div = (
        (np.roll(hux, -1, axis=1) - np.roll(hux, 1, axis=1)) / (2 * dx)
        + (np.roll(huy, -1, axis=0) - np.roll(huy, 1, axis=0)) / (2 * dy)
    )
    h_new = np.maximum(h - dt * div, 0.0)

    # Pressure gradient
    dhdx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)
    dhdy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) / (2 * dy)

    # Manning friction
    h_safe = np.maximum(h, 1e-4)
    speed  = np.sqrt(ux**2 + uy**2)
    fric   = G * n**2 * speed / h_safe ** (4 / 3)

    ux_new = ux - dt * (G * dhdx + fric * ux)
    uy_new = uy - dt * (G * dhdy + fric * uy)

    # Zero out dry / barrier cells
    dry = (h_new < 1e-5) | barrier | ~wet
    h_new[dry]  = 0.0
    ux_new[dry] = 0.0
    uy_new[dry] = 0.0

    return h_new, ux_new, uy_new


def cfl_dt(h: np.ndarray, ux: np.ndarray, uy: np.ndarray, dx: float, dt_target: float) -> float:
    wave = np.sqrt(G * np.maximum(h, 1e-5))
    u_max = float((wave + np.sqrt(ux**2 + uy**2)).max())
    if u_max < 1e-10:
        return dt_target
    return min(dt_target, 0.5 * dx / u_max)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    comm = MPI.COMM_WORLD
    rank = comm.Get_rank()
    size = comm.Get_size()

    parser = argparse.ArgumentParser(
        description="MPI-parallel 2D SWE flood simulation for NYC"
    )
    parser.add_argument("--dem",           required=True)
    parser.add_argument("--mask",          required=True)
    parser.add_argument("--basins",        required=True)
    parser.add_argument("--catch-basins",  default=None,
                        help="Binary sink raster from prepare_catch_basins.py (optional)")
    parser.add_argument("--rainfall",      type=float, default=3.0,
                        help="Rainfall intensity in inches")
    parser.add_argument("--duration",      type=int,   default=60,
                        help="Simulation duration in minutes")
    parser.add_argument("--timesteps",     default="0,5,10,15,20,30,45,60",
                        help="Comma-separated output times in minutes")
    parser.add_argument("--output-dir",    required=True)
    args = parser.parse_args()

    output_times = [int(x) for x in args.timesteps.split(",")]
    rain_int = int(round(args.rainfall))

    # ── Read inputs on rank 0 ─────────────────────────────────────────────
    if rank == 0:
        wall_start = time.perf_counter()
        print(f"[flood_sim r0] rainfall={args.rainfall}in  duration={args.duration}min  ranks={size}")

        with rasterio.open(args.dem) as src:
            dem_full   = src.read(1).astype(float)
            profile    = src.profile.copy()
            transform  = src.transform
            dx         = abs(float(transform.a))
            nodata_val = src.nodata if src.nodata is not None else -9999.0

        with rasterio.open(args.mask) as src:
            mask_full = src.read(1).astype(float)

        if args.catch_basins:
            with rasterio.open(args.catch_basins) as src:
                sink_full = src.read(1).astype(bool)
            print(f"[flood_sim r0] catch basins: {sink_full.sum()} sink cells loaded")
        else:
            sink_full = None
            print("[flood_sim r0] no catch-basin sink raster provided — drainage disabled")

        total_rows, total_cols = dem_full.shape
        print(f"[flood_sim r0] grid: {total_cols} x {total_rows}  dx={dx:.2f} ft")
    else:
        dem_full = mask_full = sink_full = profile = None
        dx = nodata_val = total_rows = total_cols = None

    # Broadcast metadata
    dx          = comm.bcast(dx,          root=0)
    nodata_val  = comm.bcast(nodata_val,  root=0)
    total_rows  = comm.bcast(total_rows,  root=0)
    total_cols  = comm.bcast(total_cols,  root=0)
    profile     = comm.bcast(profile,     root=0)

    # Broadcast full arrays (for simplicity; scatter by stripe in production)
    dem_full  = comm.bcast(dem_full,  root=0)
    mask_full = comm.bcast(mask_full, root=0)
    sink_full = comm.bcast(sink_full, root=0)

    # ── Domain decomposition: row stripes ─────────────────────────────────
    rows_per_rank = total_rows // size
    row_start = rank * rows_per_rank
    row_end   = total_rows if rank == size - 1 else row_start + rows_per_rank

    local_dem  = dem_full [row_start:row_end, :]
    local_mask = mask_full[row_start:row_end, :]
    local_sink = sink_full[row_start:row_end, :] if sink_full is not None else None

    invalid = (local_dem == nodata_val) | np.isnan(local_dem)
    wet     = ~invalid
    barrier = np.zeros_like(local_dem, dtype=bool)

    # Initialize state
    rain_ft  = args.rainfall * 0.0833        # inches → feet
    h  = np.where(wet, rain_ft, 0.0)
    ux = np.zeros_like(h)
    uy = np.zeros_like(h)
    n  = manning_n(local_mask)

    # ── Time loop ─────────────────────────────────────────────────────────
    dt_target   = 0.5   # seconds
    sim_time_s  = 0.0
    next_out_idx = 0
    Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    while sim_time_s < args.duration * 60:
        dt = cfl_dt(h, ux, uy, dx, dt_target)
        h, ux, uy = swe_step(h, ux, uy, n, dx, dx, dt, barrier, wet)

        # Catch basin drainage: remove water from sink cells each sub-step
        if local_sink is not None:
            h[local_sink] = np.maximum(0.0, h[local_sink] - DRAIN_RATE_FT_S * dt)

        sim_time_s += dt

        sim_min = sim_time_s / 60.0
        if next_out_idx < len(output_times) and sim_min >= output_times[next_out_idx]:
            t_min = output_times[next_out_idx]

            # Gather local stripes to rank 0
            gathered = comm.gather(h, root=0)

            if rank == 0:
                h_full = np.vstack(gathered)
                tif_name  = f"flood_{rain_int}in_{t_min}min.tif"
                tif_path  = os.path.join(args.output_dir, tif_name)
                tile_dir  = os.path.join(args.output_dir, f"{rain_int}in_{t_min}min")

                save_flood_tif(h_full, profile, tif_path)
                generate_tiles(tif_path, tile_dir)

                elapsed = time.perf_counter() - wall_start
                print(f"[flood_sim r0] t={t_min}min  max_depth={h_full.max():.3f}ft  wall={elapsed:.1f}s")

            next_out_idx += 1
            if next_out_idx >= len(output_times):
                break

    if rank == 0:
        total_wall = time.perf_counter() - wall_start
        print(f"[flood_sim r0] DONE  wall_time={total_wall:.1f}s  nodes_used={size}")


if __name__ == "__main__":
    main()
