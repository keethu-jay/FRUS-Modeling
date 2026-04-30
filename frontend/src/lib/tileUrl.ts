import { RAIN_INCH_MAX, RAIN_INCH_MIN, TIMESTEP_MINUTES, TIME_STEP_MAX_FLOOD } from '../constants'

/**
 * XYZ raster URL for tiled flood depth PNGs.
 * Path: /data/flood/{n}in_{t}min/{z}/{x}/{y}.png
 * Example: /data/flood/3in_30min/14/4826/6137.png
 *
 * @param rainfallInches - 1, 2, or 3
 * @param timeStepIndex  - 0-7, index into TIMESTEP_MINUTES
 */
export function floodTileUrlTemplate(rainfallInches: number, timeStepIndex: number): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  const r = Math.min(RAIN_INCH_MAX, Math.max(RAIN_INCH_MIN, Math.round(rainfallInches)))
  const idx = Math.min(TIME_STEP_MAX_FLOOD, Math.max(0, Math.round(timeStepIndex)))
  const t = TIMESTEP_MINUTES[idx]
  return `${base}/data/flood/${r}in_${t}min/{z}/{x}/{y}.png`
}

/** XYZ raster URL for tiled permeability mask PNGs from gdal2tiles (Turing output). */
export function permeabilityTileUrlTemplate(): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/data/permeability/{z}/{x}/{y}.png`
}
