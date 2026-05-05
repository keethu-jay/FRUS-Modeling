// Default overview center splits the difference between the permeability mask
// (Manhattan/Brooklyn ~40.72°N) and the Staten Island pilot area (~40.47°N)
// so both datasets are roughly in-frame at the default zoom.
export const NYC_CENTER: [number, number] = [-74.006, 40.60]
export const DEFAULT_ZOOM = 12

// The LiDAR pilot area in southern Staten Island — where my curb-detection
// data and flood scenario polygons are located. The map flies here whenever
// a flood scenario is activated so the zones are immediately visible.
export const PILOT_CENTER: [number, number] = [-74.004, 40.473]
export const PILOT_ZOOM = 13

// Bounding box of the LiDAR pilot clip used for curb extraction.
export const CURB_DATA_BOUNDS = [
  [-74.024, 40.462],
  [-73.985, 40.484],
] as const satisfies readonly [[number, number], [number, number]]

// Zoom constants for the curb layer — below CURB_LINE_MIN_ZOOM the line
// width is blurred/wide so the curbs read as a soft barrier mesh at city scale.
export const CURB_LINE_MIN_ZOOM = 10
export const CURB_LINE_DETAIL_ZOOM = 13

// Max height for the barrier_height_ft interpolation in the curb GeoJSON.
// Anything above 0.85 ft gets the same "tall curb" styling.
export const CURB_BARRIER_HEIGHT_FT_MAX = 0.85

// High-res 0.5 m LiDAR contour tileset — extracted from nyc_final_0.1m.tif
// covering Inwood Hill / northern Manhattan (~40.85°N).
// Tiles only exist at zoom 16; fly there when the layer is enabled.
export const LIDAR_CONTOURS_TILESET  = 'keethu-j.nyc_contours_0_5m'
export const LIDAR_CONTOURS_CENTER: [number, number] = [-74.01824, 40.85612]
export const LIDAR_CONTOURS_ZOOM     = 16

// Rainfall slider range — 0 means flood off, 1–3 map to the three GeoJSON
// flood scenarios I generated for the Staten Island pilot area.
export const RAIN_INCH_MIN = 1
export const RAIN_INCH_MAX = 3
export const RAIN_SLIDER_MIN = 0

// The three flood scenarios I modeled for the Flood Vulnerability Simulator.
// Each references a GeoJSON file in public/data/vectors/ that I created by
// tracing representative flood extents for the pilot area based on
// the three severity levels from the original flood_scenarios.zip shapefiles.
export const FLOOD_SCENARIOS = {
  1: {
    label: 'Heavy Rain',
    subtitle: '1 in / hr',
    description: 'Local ponding · drainage channel overflow',
    file: 'flood_heavy_rain.geojson',
  },
  2: {
    label: 'Cloudburst',
    subtitle: '3 in / hr',
    description: 'Widespread street flooding · low areas inundated',
    file: 'flood_cloudburst.geojson',
  },
  3: {
    label: 'Extreme Flood',
    subtitle: 'Storm surge',
    description: 'Coastal inundation · major infrastructure impact',
    file: 'flood_extreme.geojson',
  },
} as const satisfies Record<number, { label: string; subtitle: string; description: string; file: string }>
