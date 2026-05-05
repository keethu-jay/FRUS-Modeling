/** NYC center [lng, lat] — Manhattan */
export const NYC_CENTER: [number, number] = [-74.006, 40.7128]

/** Default zoom for NYC street context with vector overlays */
export const DEFAULT_ZOOM = 15

/**
 * Example WGS84 extent for a curb pilot clip (optional scripts / QA).
 * Citywide curb coverage comes from replacing `public/data/vectors/curbs.geojson`.
 */
export const CURB_DATA_BOUNDS = [
  [-74.024, 40.462],
  [-73.985, 40.484],
] as const satisfies readonly [[number, number], [number, number]]

/** Curb mesh first drawn at regional zoom; street-scale ramp uses CURB_LINE_DETAIL_ZOOM */
export const CURB_LINE_MIN_ZOOM = 10

/** Zoom where line width/opacity match street-scale tuning */
export const CURB_LINE_DETAIL_ZOOM = 13

/** Upper bound (feet) for color/width interpolation on `barrier_height_ft` in curb GeoJSON */
export const CURB_BARRIER_HEIGHT_FT_MAX = 0.85

/** Tile folders use 1–3 in only — matches PRD §7.4 */
export const RAIN_INCH_MIN = 1
export const RAIN_INCH_MAX = 3

/** Slider includes 0 = flood raster hidden (tiles still resolve to 1 in paths; opacity forced to 0). */
export const RAIN_SLIDER_MIN = 0

/**
 * Timestep values in minutes — one output frame per entry.
 * The UI slider index maps into this array.
 * Matches PRD §7.4: flood/{n}in_{t}min/
 */
export const TIMESTEP_MINUTES = [0, 5, 10, 15, 20, 30, 45, 60] as const
export type TimestepMinutes = (typeof TIMESTEP_MINUTES)[number]

/** Slider index bounds for the timestep control */
export const TIME_STEP_MIN = 0
export const TIME_STEP_MAX_FLOOD = TIMESTEP_MINUTES.length - 1  // 7

/**
 * Default max `.zip` size for in-browser shapefile → GeoJSON (shpjs).
 * Oversized archives blow browser RAM (GeoJSON is far larger than the zip).
 * Override with `VITE_MAX_SHAPEFILE_ZIP_MB` if you use a smaller pilot clip.
 */
export const DEFAULT_MAX_SHAPEFILE_ZIP_MB = 48

export function maxShapefileZipBytes(): number {
  const raw = import.meta.env.VITE_MAX_SHAPEFILE_ZIP_MB as string | undefined
  const mb = raw?.trim() ? Number(raw.trim()) : DEFAULT_MAX_SHAPEFILE_ZIP_MB
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_MAX_SHAPEFILE_ZIP_MB * 1024 * 1024
  return mb * 1024 * 1024
}
