# Deploying Eco-Sentry NYC (free hosting)

The app is a **static site** after `npm run build` (`frontend/dist/`). You can host it on **GitHub Pages**, **Vercel**, or **Netlify** at no cost for a portfolio.

## Before you add large simulation data

1. **Mapbox token** — Required for the map. Create a **public** token at [Mapbox access tokens](https://account.mapbox.com/access-tokens/). For production, use **URL restrictions** (your GitHub Pages domain and/or `localhost` for dev).
2. **Base path** — Only matters if the site is **not** at the domain root (e.g. `https://you.github.io/FRUS-Modeling/`). The repo is configured so CI sets `VITE_BASE_PATH` automatically for GitHub Pages; local dev uses `/` from `.env.example`.

## GitHub Pages (this repo)

1. Push this project to GitHub (e.g. `FRUS-Modeling`).
2. **Settings → Secrets and variables → Actions → New repository secret**  
   - Name: `VITE_MAPBOX_ACCESS_TOKEN`  
   - Value: your `pk.` token.
3. **Settings → Pages → Build and deployment → Source: GitHub Actions** (not “Deploy from a branch” for this workflow).
4. Push to `main` (or `master`). The workflow **Deploy frontend to GitHub Pages** builds `frontend/` and publishes `dist/`.
5. Site URL: **`https://<username>.github.io/<repository-name>/`**  
   After data files exist, copy tiles under `frontend/public/data/` before build (or extend the workflow to fetch artifacts—optional later).

If the workflow fails on first run, ensure **Actions** are enabled for the repository.

## Local production preview

```bash
cd frontend
# Optional: match GitHub Pages base when testing subpath
# set VITE_BASE_PATH=/FRUS-Modeling/   # PowerShell: $env:VITE_BASE_PATH="/FRUS-Modeling/"
npm run build
npm run preview
```

## Vercel or Netlify (root URL, often simpler)

- **Root URL** (`https://your-project.vercel.app/`): set **Root directory** to `frontend`, build command `npm run build`, output `dist`. Do **not** set `VITE_BASE_PATH` (defaults to `/`).
- Add **`VITE_MAPBOX_ACCESS_TOKEN`** in the host’s environment variables for production builds.

## Data size note

Simulation outputs can be **very large**. GitHub-hosted repos are not meant for multi‑GB assets. For portfolio demos, keep a **small spatial subset** of tiles in `public/data/` or host rasters on **object storage / CDN** later and point the app at those URLs.
