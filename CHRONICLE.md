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
