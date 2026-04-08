# Turing cluster — preprocessing scripts

Use this folder for **shell and Python helpers** you run on the school **Turing** HPC (or locally) after **transferring / unzipping** simulation or imagery data. Add new scripts here and document them in the table below.

---

## Script index

| Script | What it does | Inputs | Outcome / outputs |
|--------|----------------|--------|-------------------|
| **`create_permeable_mask.py`** | Reads a **4-band GeoTIFF**, computes **NDVI** from band 1 (Red) and band 4 (NIR), thresholds at **0.3** to separate vegetation/soil (permeable) vs built/impervious (impermeable). Writes a **single-band uint8** raster. | `--input` path to GeoTIFF; optional `--output` (default `permeable_mask.tif`) | **Binary mask**: pixel value **1** = permeable (NDVI > 0.3), **0** = impermeable. Same georeferencing as source (from Rasterio profile). Use this as the base for NDVI/permeability layers before tiling for the web app (`frontend/public/data/ortho_mask/`). |

---

## Environment

```bash
cd turing
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

On Turing, prefer **conda** or **module load** if your site provides GDAL/rasterio builds linked to the system GDAL.

---

## Example: permeable mask

```bash
python create_permeable_mask.py --input /path/to/4band.tif --output ./permeable_mask.tif
```

**Note:** Band order must match your file (**band 1 = Red, band 4 = NIR**). If your sensor orders bands differently, edit the `read(1)` / `read(4)` indices in the script.

---

## Unzipping archives on the cluster (no script in repo yet)

Typical one-liners after `scp` or `rsync` to Turing:

```bash
# Zip
unzip -q archive.zip -d /path/to/output_dir

# tar.gz
tar -xzf archive.tar.gz -C /path/to/output_dir

# tar.bz2
tar -xjf archive.tar.bz2 -C /path/to/output_dir
```

Add a small `extract_*.sh` here if you want a repeatable pattern (paths, modules, scratch dir).

---

## Link to the Eco-Sentry frontend

- Tiled permeability / NDVI-style rasters for the map: see `frontend/public/data/ortho_mask/` and `CHRONICLE.md`.
- After GDAL tiling (e.g. `gdal2tiles`), paths should match what `frontend/src/lib/tileUrl.js` expects.

---

*Add a new row to the table whenever you drop in another script.*
