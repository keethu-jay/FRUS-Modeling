/** NYC center [lng, lat] */
export const NYC_CENTER: [number, number] = [-74.006, 40.7128]

export const DEFAULT_ZOOM = 11.2

/** Rainfall scenario values (inches) — matches PRD §7.4 */
export const RAIN_INCH_MIN = 1
export const RAIN_INCH_MAX = 3

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
