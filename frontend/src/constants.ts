/** NYC center [lng, lat] */
export const NYC_CENTER: [number, number] = [-74.006, 40.7128]

export const DEFAULT_ZOOM = 11.2

/** LiDAR curb linework is tiled / simplified for close views only */
export const CURB_LAYER_MIN_ZOOM = 13

/** When enabling curbs from a city-wide view, land here so the raised-lip styling reads */
export const CURB_FOCUS_ZOOM = 14.5

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
