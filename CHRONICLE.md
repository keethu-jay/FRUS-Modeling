# Eco-Sentry NYC / Flood Modeling Project — Chronicle

This document records **what exists in this repository**, **which libraries are used and why**, and **how the pieces are meant to fit together** from high-performance simulation on a cluster through a browser-based map.

---

## 1. Repository layout (today)

| Path | Role |
|------|------|
| `frontend/` | **Eco-Sentry NYC** web app: Vite + React + Mapbox map shell for tiled flood and ancillary layers. |
| `frontend/public/data/` | Static assets served at `/data/...`: flood rasters as XYZ tiles, NDVI mask tiles, GeoJSON for drains/curbs, optional metadata. |
| `Papers/` | Reference PDFs and HTML exports (literature and methods background). Not consumed by the app at runtime. |
| Remote: [FRUS-Modeling](https://github.com/keethu-jay/FRUS-Modeling) | Git remote used to version this project (initial commit included `Papers/`). |

There is **no Python package or `requirements.txt` in the repo yet**. The sections below describe **where Python fits in the intended workflow** (cleaning outputs, tiling, QA) once simulations finish on the Turing cluster.

---

## 2. Libraries and tools — what and why

### 2.1 Frontend (`frontend/package.json`)

| Library / tool | Role | Why it is here |
|----------------|------|----------------|
| **Vite** | Dev server and production bundler | Fast HMR, simple config, standard for modern React. |
| **React** + **react-dom** | UI framework | Component model for map + sidebar + controls; state for rainfall, time step, layer toggles. |
| **mapbox-gl** | Map engine | WebGL basemap (`dark-v11`), raster sources for tiled PNGs, GeoJSON layers for vectors; `setTiles()` switches flood scenarios without destroying the map. |
| **Tailwind CSS** (via **@tailwindcss/vite**) | Styling | Utility-first layout (full-screen map, glass sidebar, legend); Eco-Sentry palette lives in `src/index.css` `@theme`. |
| **lucide-react** | Icons | Rain, waves, layers, play/pause, etc., without shipping a heavy icon font. |
| **ESLint** (+ React hooks / refresh plugins) | Linting | Catches common React issues during development. |

### 2.2 Fonts (not npm packages)

| Source | Role |
|--------|------|
| **Source Sans 3** (Google Fonts, linked in `frontend/index.html`) | Clear, readable UI type for labels and controls. |

### 2.3 Secrets and configuration

| Item | Role |
|------|------|
| **`VITE_MAPBOX_ACCESS_TOKEN`** (see `frontend/.env.example`) | Required for Mapbox styles and tiles; never commit real tokens—use `.env` locally (listed in `frontend/.gitignore`). |

### 2.4 Intended off-repo tools (cluster & preprocessing)

These are **not** pinned in this repository but belong in the **end-to-end story**:

| Tool / environment | Typical role |
|---------------------|--------------|
| **SLURM** (Turing cluster) | Schedule GPU/CPU jobs for large urban flood runs (e.g. non-uniform grid solvers). |
| **Python** (+ NumPy, GDAL bindings, or CLI wrappers) | Post-process raw outputs: reproject, clip, mask nodata, build aggregates, **orchestrate tiling**. |
| **gdal2tiles** / **rio** / similar | Turn large GeoTIFFs into **XYZ PNG** trees the frontend can load from `/data/flood_layers/...`. |

---

## 3. Chronology — what happened in this repo

Steps are listed in roughly the order they occurred while building out the project.

1. **Project folder and Git**  
   - Workspace: *Flood Modeling Project* on the desktop.  
   - Git initialized and connected to **`https://github.com/keethu-jay/FRUS-Modeling.git`**, with an initial commit tracking reference materials under `Papers/`.

2. **Frontend scaffold**  
   - **`npm create vite@latest frontend -- --template react`** created a blank React app (starter template).  
   - Dependencies added: **mapbox-gl**, **lucide-react**, **tailwindcss** + **@tailwindcss/vite**.

3. **Eco-Sentry NYC map shell**  
   - Full-viewport Mapbox map centered on NYC, dark style.  
   - Left **glass-style sidebar**: rainfall slider (0–10 in), time-step playback (frames 0–47), toggles for NDVI mask, LiDAR curb lines, catch basins.  
   - **Raster flood layer** wired to a URL template under `public/data/flood_layers/{inch}/{time}/{z}/{x}/{y}.png`; intensity/time changes call **`setTiles()`** so the map instance is not recreated.  
   - **NDVI / ortho** raster template: `/data/ortho_mask/{z}/{x}/{y}.png`.  
   - **GeoJSON**: `catch_basins.geojson`, `curb_geometry.geojson` (starter/demo or empty collection).  
   - **Legend** (bottom-right): depth scale; styled with the Eco-Sentry color ramp.

4. **Branding and readability**  
   - Accent palette documented in theme: Honey Quartz, Chartreuse, Persimmon, Khaki, Army (`frontend/src/index.css`).  
   - **Source Sans 3** for legible dashboard typography.

5. **Data directories for “drop-in” simulation outputs**  
   - Under `frontend/public/data/`: `flood_layers/`, `ortho_mask/`, `metadata/`, `tiles/` (placeholder), plus GeoJSON files—so that after **Turing** produces and **Python/GDAL** prepares tiles, files can be copied here and the site will pick them up on refresh.

---

## 4. Intended pipeline: Turing → clean/tile → React map

This is the **logical flow** the repo is designed to support; implement scripts on the cluster or locally as needed.

```text
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│ Turing (SLURM)      │     │ Python + GDAL / tooling  │     │ This repo (React)      │
│ Flood simulation    │ ──► │ Clean, validate, tile     │ ──► │ Serves static /data     │
│ (large rasters)     │     │ (e.g. gdal2tiles → PNG)   │     │ Mapbox displays layers  │
└─────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

1. **Run the solver on Turing** using an appropriate `sbatch` script (partition, walltime, modules, paths to your binary and inputs).  
2. **Transfer or stage outputs** where you can preprocess them (scratch → workstation, or job post-processing step).  
3. **Use Python (and GDAL)** to align rasters with your web map CRS, fix nodata, optionally downsample, then **emit XYZ tiles** into the same folder pattern the app expects (`flood_layers`, `ortho_mask`, etc.).  
4. **Copy** the resulting `public/data/...` tree into `frontend/public/data/` (or deploy alongside the built `dist/` assets).  
5. **Open the React app** — Mapbox loads the basemap and your local tile URLs; sliders swap precomputed scenarios via `setTiles()`.

---

## 5. Commands (quick reference)

From `frontend/`:

```bash
npm install          # install dependencies
cp .env.example .env # add VITE_MAPBOX_ACCESS_TOKEN
npm run dev          # local development
npm run build        # production build → dist/
npm run lint         # ESLint
```

---

## 6. Hosting (portfolio)

- **`DEPLOY.md`** — GitHub Pages, Vercel/Netlify, Mapbox secret, and `VITE_BASE_PATH` for project URLs.  
- **`.github/workflows/deploy-frontend.yml`** — builds `frontend/` and publishes to **GitHub Pages** when you push to `main`/`master` (enable **Pages → GitHub Actions** and add the `VITE_MAPBOX_ACCESS_TOKEN` repository secret).

## 7. What to add next (suggested)

- **`requirements.txt`** (or `pyproject.toml`) and a **`scripts/`** folder for Python: ingest Turing outputs, QA plots, and GDAL tiling with paths matching `public/data/`.  
- **Sample tile subset** for development only (small spatial extent) so the map shows real pixels without copying hundreds of GB.

---

*Last updated to match the repository state and the Eco-Sentry NYC frontend described above.*

---

## [INFRA] JSX → TypeScript Migration + GeoTIFF Mask Viewer

**Date:** 2026-04-29
**Status:** COMPLETED

### What was done
- Installed TypeScript (`typescript`, `@types/react`, `@types/react-dom`, `@types/proj4`, `typescript-eslint`) and GeoTIFF runtime deps (`geotiff`, `proj4`).
- Converted all source files from `.jsx`/`.js` to `.tsx`/`.ts`: `App`, `main`, `MapContainer`, `Sidebar`, `DepthLegend`, `constants`, `lib/tileUrl`.
- Created `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js` (TypeScript-aware), `src/vite-env.d.ts`.
- Created `src/types.ts` (`LayerVisibility`, `GeoTiffMaskResult`) and `src/hooks/useGeoTiffMask.ts`.
- `useGeoTiffMask`: fetches `final_mask.tif` via `fetch()` + `ArrayBuffer` (avoids range-request issues with Vite dev server), decodes with `geotiff`, reprojects bounding box to WGS84 via `proj4` (supports EPSG 4326, 32618, 26918, 2263, 6539), renders binary pixels to canvas (chartreuse = permeable, transparent = impermeable), returns base64 PNG + 4-corner coordinates for a Mapbox `image` source.
- Copied `final_mask.tif` to `frontend/public/data/final_mask.tif` for browser serving.
- Added `mapReady` state to `MapContainer` to coordinate async mask loading with Mapbox `load` event.
- Added map constraints: `minZoom=9`, `maxZoom=18`, `maxBounds` locked to NYC metro area.
- Added `npm run typecheck` script.

### What happened
TypeScript compilation clean on first pass after fixing three issues: (1) missing `vite/client` types for `ImportMeta.env`, (2) CSS side-effect import declarations, (3) `mapbox-gl` image source type mismatch resolved with `as any`, (4) `geotiff` `geoKeys` property not in public TypeScript interface — resolved with `(image as any).geoKeys`.

### Mistakes / Gotchas
- `geotiff`'s `fromUrl()` silently fails on Vite dev server because it uses HTTP range requests the dev server doesn't support. Fix: `fetch()` full buffer first, then `fromArrayBuffer()`.
- `mapbox-gl` v3 bundles its own types — do NOT install `@types/mapbox-gl` (conflicts).

### Output files
- `frontend/src/` — all `.jsx` deleted, `.tsx` created
- `frontend/public/data/final_mask.tif` — served statically for browser GeoTIFF decode
- `frontend/tsconfig.json`, `frontend/tsconfig.node.json`

---

## [INFRA] Frontend Data Contract Alignment (PRD §7)

**Date:** 2026-04-30
**Status:** COMPLETED

### What was done
- Updated `constants.ts`: rainfall range 1–3 inches (was 0–10), added `TIMESTEP_MINUTES = [0,5,10,15,20,30,45,60]` array; `TIME_STEP_MAX_FLOOD = 7` (index into array).
- Updated `lib/tileUrl.ts`: flood URL pattern changed from `/data/flood_layers/{in}/{t}/` to `/data/flood/{n}in_{t}min/` per PRD §7.1. Added `permeabilityTileUrlTemplate()` for future Turing tiles at `/data/permeability/`.
- Updated `MapContainer.tsx`: vector sources changed from `/data/catch_basins.geojson` / `/data/curb_geometry.geojson` to `/data/vectors/catch_basins.geojson` / `/data/vectors/curbs.geojson` per PRD §7.2.
- Updated `Sidebar.tsx`: rainfall slider step=1 (integer), timestep display shows `T+{n} min / 60 min`, added tick marks for all 8 timestep values.
- Updated `App.tsx`: initial rainfall = 2 in (center of 1–3 range).
- Created `frontend/public/data/vectors/` directory structure.
- Moved `catch_basins.geojson` to `vectors/`.
- Created `vectors/curbs.geojson` (empty FeatureCollection — populated after M-2).
- Created `frontend/public/data/scenarios.json` manifest (PRD §7.4).
- Created `frontend/public/data/permeability/` placeholder (receives Turing tiles after M-0).
- Created `frontend/public/data/flood/` placeholder (receives simulation tiles after M-4).

### What happened
All TypeScript type checks pass after refactoring. `TIME_STEP_MAX_FLOOD` is now a derived constant (`TIMESTEP_MINUTES.length - 1`) so adding or removing timestep values is a single-line change.

### Output files
- `frontend/public/data/scenarios.json`
- `frontend/public/data/vectors/catch_basins.geojson`
- `frontend/public/data/vectors/curbs.geojson` (empty placeholder)

---

## [MILESTONE-0] Permeability Tile Verification — PENDING

**Date:** 2026-04-30
**Status:** IN PROGRESS — awaiting SSH verification on Turing

### What was done
- Created SLURM script `turing/slurm/gdal2tiles.sh` to re-run `gdal2tiles.py` if existing run incomplete.
- Tiles expected at: `~/flood_env/permeability_tiles/{z}/{x}/{y}.png` on Turing.
- Target local path after rsync: `frontend/public/data/permeability/`.

### Next steps (manual)
1. SSH to Turing: `ls -lh ~/flood_env/permeability_tiles/`
2. If z/x/y structure present: `rsync -av ~/flood_env/permeability_tiles/ <local>/frontend/public/data/permeability/`
3. If missing: `sbatch turing/slurm/gdal2tiles.sh`, then rsync after job.

---

## [MILESTONE-1] LiDAR DEM Processing — PENDING

**Date:** 2026-04-30
**Status:** PENDING — LiDAR .LAZ not yet downloaded

### What was done
- Created `turing/process_lidar.py`: PDAL pipeline to filter ground returns (class 2), rasterize to 1ft float32 GeoTIFF at EPSG:2263. Logs min/max elevation, nodata coverage, output CRS.
- Created `turing/slurm/lidar_dem.sh`: SLURM job (64GB, 8 CPUs, A30 GPU, 2h walltime).

### Next steps (manual)
1. Download .LAZ from NOAA Digital Coast (datasets 9851 or 9689, NYC bounding box).
2. On Turing: `cd ~/flood_env && wget <LAZ_URL> -O nyc_lidar.laz`
3. `sbatch turing/slurm/lidar_dem.sh`
4. Validate: `gdalinfo ~/flood_env/dem.tif` — check CRS matches `final_mask.tif`.
5. If CRS mismatch: `gdalwarp -t_srs EPSG:4326 dem.tif dem_reprojected.tif`

---

## [MILESTONE-2] Curb Breakline Detection — PENDING

**Date:** 2026-04-30
**Status:** PENDING — requires dem.tif (M-1)

### What was done
- Created `turing/detect_curbs.py`: Sobel gradient on DEM, thresholds 0.25–0.5 ft/px, skeletonize binary mask, vectorize to GeoJSON LineString features with `barrier_height_ft` attribute.
- Created `turing/slurm/curb_detect.sh`: SLURM job (32GB, 4 CPUs, 1h walltime).

### Next steps (manual)
1. After M-1: `sbatch turing/slurm/curb_detect.sh`
2. Download: `scp <turing>:~/flood_env/curbs.geojson frontend/public/data/vectors/curbs.geojson`

---

## [MILESTONE-3] Watershed Transform — PENDING

**Date:** 2026-04-30
**Status:** PENDING — requires dem.tif + curbs.geojson (M-1, M-2)

### What was done
- Created `turing/run_watershed.py`: co-registers DEM to mask grid via `gdalwarp`, inverts DEM, applies permeability cost weighting (concrete=1.0x, grass=0.2x), burns curb barriers, runs `skimage.segmentation.watershed` with auto-detected minima, outputs labeled raster + basin stats CSV.
- Created `turing/slurm/watershed.sh`: SLURM job (64GB, 16 CPUs, A30 GPU, 3h walltime).

---

## [MILESTONE-4] Flood Simulation (SWE) — PENDING

**Date:** 2026-04-30
**Status:** PENDING — requires dem.tif + watershed_basins.tif (M-1, M-3)

### What was done
- Created `turing/run_flood_sim.py`: MPI row-striped 2D SWE solver. Manning's n=0.013 (concrete) / 0.035 (grass). CFL-adaptive timestep. Outputs one GeoTIFF per scenario timestep + calls `gdal2tiles.py` to tile each. Color encoding per PRD §7.3.
- Created `turing/slurm/flood_sim.sh`: 2-node SLURM job (128GB, 2×A30, 6h walltime). Loops over 3 rainfall scenarios automatically.
- Output tile path pattern matches frontend contract: `/data/flood/{n}in_{t}min/{z}/{x}/{y}.png`.

---

## [MILESTONE-5] Infrastructure Recommender — PENDING

**Date:** 2026-04-30
**Status:** PENDING — requires flood outputs (M-4)

### What was done
- Created `turing/build_recommender.py`: intersects flood depth > 0.5ft + permeability=0 + large catchment basin, clusters candidates with DBSCAN (eps=50ft), ranks by priority score (mean_depth × catchment_area), outputs top-N GeoJSON Point features.
- Output: `bioswale_recommendations.geojson` → copy to `frontend/public/data/vectors/`.

---

## [INFRA] Turing Requirements Update

**Date:** 2026-04-30
**Status:** COMPLETED

### What was done
- Updated `turing/requirements.txt` with all new pipeline dependencies: `scipy`, `scikit-image`, `scikit-learn`, `geopandas`, `shapely`, `Pillow`, `pdal`, `mpi4py`.
- Install on Turing: `pip install -r turing/requirements.txt` inside `~/flood_env/`.

---

## [CATCH-BASINS] NYCDEP Catch Basin Integration

**Date:** 2026-04-29
**Status:** COMPLETED

### What was done

**Data**: Integrated `NYCDEP_Citywide_Catch_Basins_20260430.geojson` (77 MB, 154,212 WGS84 points from NYC DEP). Each feature carries `unitid`, `point_x`/`point_y` (EPSG:2263 feet), and assorted metadata.

**Frontend** (`frontend/public/data/vectors/catch_basins.geojson`):
- Slimmed the 77 MB file to 20.8 MB by stripping all properties except `unitid`.
- Replaced the 3-point demo placeholder with all 154,212 real catch basin locations.
- Enabled Mapbox GL JS clustering on `SOURCE_CATCH` (`cluster: true, clusterRadius: 50, clusterMaxZoom: 14`).
- Added `LAYER_CATCH_CLUSTER` (amber circles, stepped radius by `point_count`) and `LAYER_CATCH_COUNT` (symbol layer with `point_count_abbreviated` labels) for zoom ≤ 14.
- `LAYER_CATCH` (individual amber circles) only renders at zoom > 14 via `filter: ['!', ['has', 'point_count']]`.
- All three layers respect the existing `catchBasins` toggle in `LayerVisibility`.

**Simulation** (`turing/run_flood_sim.py`):
- Added `--catch-basins` optional argument (path to binary sink raster).
- After each SWE sub-step, applies drainage: `h[sink_mask] = max(0, h[sink_mask] - DRAIN_RATE_FT_S * dt)` where `DRAIN_RATE_FT_S = 0.01` ft/s.
- Sink raster broadcast to all MPI ranks alongside DEM and permeability mask.

**New utility** (`turing/prepare_catch_basins.py`):
- Reads the raw NYCDEP GeoJSON on the Turing cluster.
- Converts `point_x`/`point_y` (EPSG:2263 ft) to DEM grid row/col via `rasterio.transform.rowcol`.
- Writes `catch_basin_sinks.tif` (uint8, LZW compressed) — 1 where a basin exists, 0 elsewhere.
- Run once before submitting `flood_sim.sh`.

**SLURM** (`turing/slurm/flood_sim.sh`):
- Added `SINKS` variable and `--catch-basins "$SINKS"` to all three `mpirun` calls.
- Added prerequisite comment with the `prepare_catch_basins.py` invocation.

### Next steps (manual on Turing)
1. Copy `NYCDEP_Citywide_Catch_Basins_20260430.geojson` to Turing (or use scp).
2. `python turing/prepare_catch_basins.py --geojson <path> --dem ~/flood_env/dem.tif --output ~/flood_env/catch_basin_sinks.tif`
3. Submit flood simulation: `sbatch turing/slurm/flood_sim.sh`
