/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string
  readonly VITE_BASE_PATH?: string
  /** Path under `public/` for LiDAR curb GeoJSON (default `data/vectors/curbs.geojson`) */
  readonly VITE_CURBS_GEOJSON?: string
  /** Mapbox account username for eco_topo_nyc_* vector tilesets (default keethu-j) */
  readonly VITE_MAPBOX_TOPO_USERNAME?: string
  /** Path under `public/` for mask shapefile zip (default `data/mask_vector.zip`) */
  readonly VITE_MASK_VECTOR_ZIP?: string
  /** Max shapefile `.zip` size in MB for client-side parse (default 48). Larger zips should use tiles or a clipped bundle. */
  readonly VITE_MAX_SHAPEFILE_ZIP_MB?: string
}

declare module '*.css' {
  const content: string
  export default content
}
