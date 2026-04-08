import { RAIN_INCH_MAX, TIME_STEP_MAX_FLOOD } from '../constants.js'

/**
 * XYZ raster URL for tiled flood depth PNGs under `public/data/flood_layers/`.
 * @param {number} intensityInches - 0–10 (rounded for disk layout)
 * @param {number} timeStep - frame index
 */
export function floodTileUrlTemplate(intensityInches, timeStep) {
  const base =
    typeof window !== 'undefined' ? window.location.origin : ''
  const i = Math.min(RAIN_INCH_MAX, Math.max(0, Math.round(intensityInches)))
  const t = Math.min(TIME_STEP_MAX_FLOOD, Math.max(0, Math.round(timeStep)))
  return `${base}/data/flood_layers/${i}/${t}/{z}/{x}/{y}.png`
}

export function orthoMaskTileUrlTemplate() {
  const base =
    typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/data/ortho_mask/{z}/{x}/{y}.png`
}
