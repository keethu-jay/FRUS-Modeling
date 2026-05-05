import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  CURB_BARRIER_HEIGHT_FT_MAX,
  CURB_LINE_DETAIL_ZOOM,
  CURB_LINE_MIN_ZOOM,
  DEFAULT_ZOOM,
  FLOOD_SCENARIOS,
  LIDAR_CONTOURS_CENTER,
  LIDAR_CONTOURS_TILESET,
  LIDAR_CONTOURS_ZOOM,
  NYC_CENTER,
  PILOT_CENTER,
  PILOT_ZOOM,
} from '../constants'
import { publicAssetUrl } from '../lib/publicAssetUrl'
import {
  allTopoVectorLayerIds,
  mapboxTopoUsername,
  topoFillLayerId,
  topoLineLayerId,
  topoTilesetSpecs,
  topoVectorSourceId,
} from '../lib/topoMapboxTilesets'
import type { LayerVisibility } from '../types'

const STYLE = 'mapbox://styles/mapbox/dark-v11'

// I uploaded perm_mask_upload.tif (reprojected from EPSG:2263 to WGS84) to
// Mapbox as a raster tileset. raster-color + raster-value lets me threshold
// the pixel values so only permeable surfaces (value ≥ 0.5) show green.
const PERM_MASK_TILESET = 'keethu-j.perm_mask_nyc'
const PERMEABLE_COLOR   = '#00e676'

// Source IDs — keep them prefixed with 'eco-' so they don't clash with
// anything in the base style (dark-v11 uses 'composite', 'mapbox-dem', etc.)
const SOURCE_PERM_MASK  = 'perm-mask-raster'
const SOURCE_CURB       = 'curb-lidar'
const SOURCE_CATCH      = 'catch-basins'
const SOURCE_NYC_TOPO   = 'eco-terrain-v2'
const SOURCE_DEM        = 'eco-dem'
const SOURCE_FLOOD_1    = 'flood-heavy-rain'
const SOURCE_FLOOD_2    = 'flood-cloudburst'
const SOURCE_FLOOD_3    = 'flood-extreme'
// Shore contours derived from raster-to-vector surface analysis of the 1m DEM.
// 1m = first inundation level, 2m = secondary spread boundary.
const SOURCE_SHORE_1M   = 'shore-1m'
const SOURCE_SHORE_2M   = 'shore-2m'

const LAYER_PERM_MASK        = 'eco-perm-mask'
const LAYER_CURB             = 'eco-curb-lines'
const LAYER_CATCH            = 'eco-catch-points'
const LAYER_CATCH_CLUSTER    = 'eco-catch-clusters'
const LAYER_CATCH_COUNT      = 'eco-catch-count'
const LAYER_HILLSHADE        = 'eco-hillshade'
const LAYER_NYC_TOPO_MAJOR   = 'eco-nyc-topo-major'
const LAYER_NYC_TOPO_MINOR   = 'eco-nyc-topo-minor'
// Flood fill layers sit between the hillshade and the contour/curb lines so
// the curbs visually bound the water (they were drawn on top in the load order).
// I control visibility via fill-opacity instead of layout.visibility so the
// 600ms transition works — toggling visibility has no animation.
const LAYER_FLOOD_1          = 'eco-flood-heavy'
const LAYER_FLOOD_2          = 'eco-flood-cloudburst'
const LAYER_FLOOD_3          = 'eco-flood-extreme'
// High-res LiDAR contours from the Inwood 0.1m DEM — uploaded as a Mapbox
// vector tileset. Tiles exist only at zoom 16; the map flies there on activation.
const SOURCE_CONTOURS = 'eco-lidar-contours'
const LAYER_CONTOURS  = 'eco-lidar-contour-lines'

// Shore sink layers go above flood fills so the contour boundaries are visible
// on top of the flooded area. The HR (high-risk) layer is a bright glow overlay
// that highlights the smallest/deepest depressions — shortest perimeter = first to fill.
const LAYER_SHORE_2M         = 'eco-shore-2m'
const LAYER_SHORE_1M         = 'eco-shore-1m'
const LAYER_SHORE_HR         = 'eco-shore-hr'

const FLOOD_FILL_COLOR  = '#007cbf'   // deep water blue
const FLOOD_FILL_ACTIVE = 0.62        // opacity when the scenario is active
const FLOOD_EDGE_COLOR  = '#005fa3'

// Catch basins are NYC Open Data points — I'm showing them clustered so the
// map doesn't try to render 50k+ individual circles at once.
const CATCH_GEOJSON   = publicAssetUrl('data/vectors/catch_basins.geojson')
const EMPTY_FC        = { type: 'FeatureCollection' as const, features: [] as [] }

// VITE_CURBS_GEOJSON lets me swap to a smaller clip in dev without changing code.
const CURB_GEOJSON_URL = publicAssetUrl(
  ((import.meta.env.VITE_CURBS_GEOJSON as string | undefined)?.trim() || 'data/vectors/curbs.geojson').replace(
    /^\/+/,
    '',
  ),
)

function setLayerVisibility(map: mapboxgl.Map, layerId: string, on: boolean) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
}

// Fade in the active flood scenario and fade out the others.
// All three layers are always present in the map; only the opacity changes.
function applyFloodOpacity(map: mapboxgl.Map, rainfallInches: number) {
  const active = Math.round(rainfallInches)
  ;[
    [LAYER_FLOOD_1, 1],
    [LAYER_FLOOD_2, 2],
    [LAYER_FLOOD_3, 3],
  ].forEach(([layer, idx]) => {
    if (!map.getLayer(layer as string)) return
    map.setPaintProperty(layer as string, 'fill-opacity', active === idx ? FLOOD_FILL_ACTIVE : 0)
  })
}

interface MapContainerProps {
  accessToken: string
  rainfallInches: number
  layers: LayerVisibility
  flyToLidarRef: React.MutableRefObject<(() => void) | null>
}

export default function MapContainer({
  accessToken,
  rainfallInches,
  layers,
  flyToLidarRef,
}: MapContainerProps) {
  const wrapRef           = useRef<HTMLDivElement>(null)
  const mapRef            = useRef<mapboxgl.Map | null>(null)
  const readyRef          = useRef(false)
  const rainfallRef       = useRef(rainfallInches)
  const prevRainfallRef   = useRef(0)   // tracks previous value so we only flyTo on first activation
  const layersRef         = useRef(layers)
  const curbMeshLoadedRef = useRef(false)

  const [mapReady, setMapReady]     = useState(false)
  const [curbLoading, setCurbLoading] = useState(false)
  const [curbError, setCurbError]   = useState<string | null>(null)

  useEffect(() => {
    rainfallRef.current = rainfallInches
    layersRef.current   = layers
  }, [rainfallInches, layers])

  // ── Mapbox initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!accessToken || !wrapRef.current) return

    mapboxgl.accessToken = accessToken

    const map = new mapboxgl.Map({
      container: wrapRef.current,
      style: STYLE,
      center: NYC_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: [
        [-74.65, 40.35],
        [-73.30, 41.10],
      ],
      attributionControl: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('error', (e) => {
      const ev = e as { error?: Error; sourceId?: string; tile?: { tileID?: unknown } }
      console.warn('[mapbox error]', ev.sourceId ?? '', ev.tile?.tileID ?? '', ev.error?.message ?? ev.error ?? e)
    })

    map.on('load', () => {
      map.setCenter(NYC_CENTER)
      map.setZoom(DEFAULT_ZOOM)

      const topoSpecs = topoTilesetSpecs()

      // ── Sources ──────────────────────────────────────────────────────────

      map.addSource(SOURCE_CURB, { type: 'geojson', data: EMPTY_FC, generateId: true })

      map.addSource(SOURCE_CATCH, {
        type: 'geojson',
        data: CATCH_GEOJSON,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      })

      // Permeability mask — Mapbox raster tileset (NDVI binary mask, value=255 → permeable)
      map.addSource(SOURCE_PERM_MASK, {
        type: 'raster',
        url: `mapbox://${PERM_MASK_TILESET}`,
        tileSize: 256,
      })

      // ── Citywide hillshade — DEM-backed, purple tint, visible even over flat NYC ──

      map.addSource(SOURCE_DEM, {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14,
      })

      map.addLayer({
        id: LAYER_HILLSHADE,
        type: 'hillshade',
        source: SOURCE_DEM,
        paint: {
          'hillshade-illumination-direction': 315,
          'hillshade-exaggeration': 0.55,
          'hillshade-highlight-color': '#e9d5ff',
          'hillshade-shadow-color': '#3b0764',
          'hillshade-accent-color': '#6d28d9',
        },
      })

      // ── Flood vulnerability GeoJSON layers (below contours + curbs so curbs bound the water) ──

      const floodUrls: [string, string, string, string, string][] = [
        [SOURCE_FLOOD_1, LAYER_FLOOD_1, publicAssetUrl(`data/vectors/${FLOOD_SCENARIOS[1].file}`), FLOOD_FILL_COLOR, FLOOD_EDGE_COLOR],
        [SOURCE_FLOOD_2, LAYER_FLOOD_2, publicAssetUrl(`data/vectors/${FLOOD_SCENARIOS[2].file}`), '#005fa3', '#004080'],
        [SOURCE_FLOOD_3, LAYER_FLOOD_3, publicAssetUrl(`data/vectors/${FLOOD_SCENARIOS[3].file}`), '#004a8f', '#003070'],
      ]

      for (const [srcId, layerId, url, fill, edge] of floodUrls) {
        map.addSource(srcId, { type: 'geojson', data: url })
        map.addLayer({
          id: layerId,
          type: 'fill',
          source: srcId,
          paint: {
            'fill-color': fill,
            'fill-opacity': 0,
            'fill-opacity-transition': { duration: 600, delay: 0 },
            'fill-outline-color': edge,
          },
        })
      }

      // ── Shore sink contours: 1m and 2m DEM inundation boundaries ──────────
      // sink_rank [0–1]: 1 = tightest enclosed depression (shortest perimeter = deepest natural sink)
      // Shorter polylines = water has nowhere to drain = Natural Catch Basin

      map.addSource(SOURCE_SHORE_2M, {
        type: 'geojson',
        data: publicAssetUrl('data/vectors/shore_2m.geojson'),
      })
      // 2m boundary is lighter — it shows where storm surge spreads further inland
      map.addLayer({
        id: LAYER_SHORE_2M,
        type: 'line',
        source: SOURCE_SHORE_2M,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#60a5fa',
          'line-width': [
            'interpolate', ['linear'], ['get', 'length_pts'],
            3, 0.5,
            100, 1.2,
            500, 2.0,
          ] as mapboxgl.ExpressionSpecification,
          'line-opacity': [
            'interpolate', ['linear'], ['get', 'length_pts'],
            3, 0.15,
            100, 0.45,
            500, 0.70,
          ] as mapboxgl.ExpressionSpecification,
        },
      })

      map.addSource(SOURCE_SHORE_1M, {
        type: 'geojson',
        data: publicAssetUrl('data/vectors/shore_1m.geojson'),
      })
      // 1m flood boundary — color + thickness scale with chain length so the main
      // flood front (long chain) reads as a dominant navy line and smaller tributary
      // branches fade to light blue in the background.
      map.addLayer({
        id: LAYER_SHORE_1M,
        type: 'line',
        source: SOURCE_SHORE_1M,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], ['get', 'length_pts'],
            3,    '#93c5fd',  // short fragment = light blue
            50,   '#2563eb',  // medium chain = medium blue
            300,  '#1e3a8a',  // long chain = dark navy = main flood front
          ] as mapboxgl.ExpressionSpecification,
          'line-width': [
            'interpolate', ['linear'], ['get', 'length_pts'],
            3, 0.6,
            50, 1.4,
            300, 2.8,
          ] as mapboxgl.ExpressionSpecification,
          'line-opacity': [
            'interpolate', ['linear'], ['get', 'length_pts'],
            3, 0.20,
            50, 0.60,
            300, 0.90,
          ] as mapboxgl.ExpressionSpecification,
        },
      })

      // Highlight overlay — cyan glow on the longest/most significant boundary chains
      // (length_pts > 100 = chains that form the dominant flood front, not detail fragments)
      map.addLayer({
        id: LAYER_SHORE_HR,
        type: 'line',
        source: SOURCE_SHORE_1M,
        filter: ['>', ['get', 'length_pts'], 100],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#00d4ff',
          'line-width': 3.5,
          'line-blur': 2.5,
          'line-opacity': 0.80,
        },
      })

      // ── Citywide topo: Mapbox terrain-v2 contour lines (appear where elevation > 10 m) ──

      map.addSource(SOURCE_NYC_TOPO, {
        type: 'vector',
        url: 'mapbox://mapbox.mapbox-terrain-v2',
      })

      // Major contours (every 5th interval, index=5)
      map.addLayer({
        id: LAYER_NYC_TOPO_MAJOR,
        type: 'line',
        source: SOURCE_NYC_TOPO,
        'source-layer': 'contour',
        filter: ['==', ['get', 'index'], 5],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#c084fc',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            9, 1.2,
            12, 2.0,
            15, 3.5,
            18, 5.0,
          ] as mapboxgl.ExpressionSpecification,
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            9, 0.7,
            12, 0.85,
            15, 0.95,
          ] as mapboxgl.ExpressionSpecification,
        },
      })

      // Minor contours (index=1)
      map.addLayer({
        id: LAYER_NYC_TOPO_MINOR,
        type: 'line',
        source: SOURCE_NYC_TOPO,
        'source-layer': 'contour',
        filter: ['==', ['get', 'index'], 1],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#a855f7',
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.7,
            13, 1.2,
            16, 2.0,
          ] as mapboxgl.ExpressionSpecification,
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            10, 0.5,
            13, 0.7,
            16, 0.85,
          ] as mapboxgl.ExpressionSpecification,
        },
      })

      // ── LiDAR pilot topo tilesets (26 parts — high-res over Sandy Hook area) ──

      const lineGeomFilter: mapboxgl.ExpressionSpecification = [
        'match', ['geometry-type'], 'LineString', true, 'MultiLineString', true, false,
      ]
      const fillGeomFilter: mapboxgl.ExpressionSpecification = [
        'match', ['geometry-type'], 'Polygon', true, 'MultiPolygon', true, false,
      ]

      for (const spec of topoSpecs) {
        const srcId = topoVectorSourceId(spec.key)
        map.addSource(srcId, { type: 'vector', url: `mapbox://${spec.tilesetId}` })
        map.addLayer({
          id: topoFillLayerId(spec.key),
          type: 'fill',
          source: srcId,
          'source-layer': spec.sourceLayer,
          filter: fillGeomFilter,
          paint: {
            'fill-color': '#c084fc',
            'fill-opacity': 0.5,
            'fill-outline-color': '#c084fc',
            'fill-antialias': true,
          },
        })
        map.addLayer({
          id: topoLineLayerId(spec.key),
          type: 'line',
          source: srcId,
          'source-layer': spec.sourceLayer,
          filter: lineGeomFilter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#e879f9',
            'line-width': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.8,
              14, 1.5,
              18, 5,
            ] as mapboxgl.ExpressionSpecification,
            'line-opacity': [
              'interpolate', ['linear'], ['zoom'],
              10, 0.6,
              14, 0.9,
              18, 1,
            ] as mapboxgl.ExpressionSpecification,
          },
        })
      }

      // ── High-res 0.5 m LiDAR contours (Inwood / northern Manhattan) ────────
      // Extracted from nyc_final_0.1m.tif via contourpy + RDP simplification.
      // Vector tiles only exist at zoom 16, so minzoom is set accordingly.
      map.addSource(SOURCE_CONTOURS, {
        type: 'vector',
        url: `mapbox://${LIDAR_CONTOURS_TILESET}`,
        minzoom: 14,
        maxzoom: 16,
      })
      map.addLayer({
        id: LAYER_CONTOURS,
        type: 'line',
        source: SOURCE_CONTOURS,
        'source-layer': 'original',
        minzoom: 14,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          // Interpolate color by elevation — light indigo at low, deep violet at high
          'line-color': [
            'interpolate', ['linear'], ['get', 'elevation'],
            0,   '#e0e7ff',
            10,  '#a5b4fc',
            25,  '#818cf8',
            45,  '#4f46e5',
            65,  '#312e81',
          ] as mapboxgl.ExpressionSpecification,
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            14, 0.4,
            16, 1.2,
          ] as mapboxgl.ExpressionSpecification,
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            14, 0.5,
            16, 0.85,
          ] as mapboxgl.ExpressionSpecification,
        },
      })

      // ── Permeability mask raster layer (green for permeable pixels) ───────
      map.addLayer({
        id: LAYER_PERM_MASK,
        type: 'raster',
        source: SOURCE_PERM_MASK,
        paint: {
          'raster-opacity': 0.65,
          // raster-value is luminance [0,1]; TIF is grayscale: 0=impermeable, 255=permeable (→1.0)
          'raster-color': [
            'step',
            ['raster-value'],
            'rgba(0,0,0,0)',
            0.5,
            PERMEABLE_COLOR,
          ],
        },
      })

      // ── Catch-basin layers ────────────────────────────────────────────────

      map.addLayer({
        id: LAYER_CATCH_CLUSTER,
        type: 'circle',
        source: SOURCE_CATCH,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#F7B720', 100, '#F7A020', 500, '#F76820'],
          'circle-radius': ['step', ['get', 'point_count'], 10, 100, 14, 500, 20],
          'circle-opacity': 0.82,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#42421E',
        },
      })

      map.addLayer({
        id: LAYER_CATCH_COUNT,
        type: 'symbol',
        source: SOURCE_CATCH,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#1a1a0a' },
      })

      map.addLayer({
        id: LAYER_CATCH,
        type: 'circle',
        source: SOURCE_CATCH,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2.5, 18, 5],
          'circle-color': '#F7B720',
          'circle-opacity': 0.72,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#42421E',
        },
      })

      // ── Curb LiDAR lines (purple gradient by barrier height) ─────────────

      const heightExpr: mapboxgl.ExpressionSpecification = [
        'min',
        ['max', 0, ['to-number', ['get', 'barrier_height_ft'], 0.08]],
        CURB_BARRIER_HEIGHT_FT_MAX,
      ]

      map.addLayer({
        id: LAYER_CURB,
        type: 'line',
        source: SOURCE_CURB,
        minzoom: CURB_LINE_MIN_ZOOM,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate', ['linear'], heightExpr,
            0,                      '#ede9fe',
            0.12,                   '#ddd6fe',
            0.28,                   '#c4b5fd',
            0.48,                   '#a78bfa',
            CURB_BARRIER_HEIGHT_FT_MAX, '#5b21b6',
          ],
          'line-width': [
            'interpolate', ['linear'], ['zoom'],
            CURB_LINE_MIN_ZOOM,   2.8,
            CURB_LINE_DETAIL_ZOOM, 1.05,
            15,                   2.6,
            17,                   4.1,
          ] as mapboxgl.ExpressionSpecification,
          'line-blur': [
            'interpolate', ['linear'], ['zoom'],
            CURB_LINE_MIN_ZOOM,   1.75,
            CURB_LINE_DETAIL_ZOOM, 0.35,
            16,                   0,
          ],
          'line-opacity': [
            'interpolate', ['linear'], ['zoom'],
            CURB_LINE_MIN_ZOOM,   0.52,
            CURB_LINE_DETAIL_ZOOM, 0.4,
            14,                   0.74,
            15.5,                 0.88,
            17,                   0.96,
          ],
        },
      })

      // ── Initial visibility from layer state ───────────────────────────────

      const lv = layersRef.current
      for (const id of allTopoVectorLayerIds(topoSpecs)) {
        setLayerVisibility(map, id, lv.topographicRelief)
      }
      setLayerVisibility(map, LAYER_HILLSHADE,      lv.topographicRelief)
      setLayerVisibility(map, LAYER_NYC_TOPO_MAJOR, lv.topographicRelief)
      setLayerVisibility(map, LAYER_NYC_TOPO_MINOR, lv.topographicRelief)
      setLayerVisibility(map, LAYER_CURB,           lv.topographicRelief)
      setLayerVisibility(map, LAYER_PERM_MASK,      lv.permeabilityNdvi)
      setLayerVisibility(map, LAYER_CATCH,          lv.catchBasins)
      setLayerVisibility(map, LAYER_CATCH_CLUSTER,  lv.catchBasins)
      setLayerVisibility(map, LAYER_CATCH_COUNT,    lv.catchBasins)
      setLayerVisibility(map, LAYER_SHORE_2M,       lv.topographicRelief)
      setLayerVisibility(map, LAYER_SHORE_1M,       lv.topographicRelief)
      setLayerVisibility(map, LAYER_SHORE_HR,       lv.topographicRelief)
      setLayerVisibility(map, LAYER_CONTOURS,       lv.topographicRelief)

      // Expose a flyTo callback so the Sidebar "Locate" button can jump to
      // the NJ Palisades high-res LiDAR area without needing direct map access.
      flyToLidarRef.current = () => {
        map.flyTo({ center: LIDAR_CONTOURS_CENTER, zoom: LIDAR_CONTOURS_ZOOM, duration: 1600, essential: true })
      }

      readyRef.current = true
      setMapReady(true)
      applyFloodOpacity(map, rainfallRef.current)

      if (import.meta.env.DEV) {
        console.info(
          '[NYC Digital Twin] Topo tilesets:', mapboxTopoUsername(), `(${topoSpecs.length} parts)`,
          '| Perm mask tileset:', PERM_MASK_TILESET,
        )
        map.on('click', (ev) => {
          const features = map.queryRenderedFeatures(ev.point)
          console.info('[click]', features[0]?.properties)
        })
      }
    })

    mapRef.current = map

    return () => {
      readyRef.current = false
      curbMeshLoadedRef.current = false
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [accessToken])

  // ── Flood scenario opacity + camera ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return

    const wasOff = prevRainfallRef.current === 0
    prevRainfallRef.current = rainfallInches

    applyFloodOpacity(map, rainfallInches)

    // The flood polygons are in the Staten Island pilot area (~40.47°N), well
    // south of the default overview viewport at 40.60°N. Without flying there
    // the user would just see an empty map. Only fly on the first activation
    // (off → on) so we don't interrupt panning while switching scenarios.
    if (rainfallInches >= 1 && wasOff) {
      map.flyTo({ center: PILOT_CENTER, zoom: PILOT_ZOOM, duration: 1400, essential: true })
    }
  }, [rainfallInches])

  // ── Layer visibility ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    setLayerVisibility(map, LAYER_PERM_MASK, layers.permeabilityNdvi)
    for (const id of allTopoVectorLayerIds(topoTilesetSpecs())) {
      setLayerVisibility(map, id, layers.topographicRelief)
    }
    setLayerVisibility(map, LAYER_HILLSHADE,      layers.topographicRelief)
    setLayerVisibility(map, LAYER_NYC_TOPO_MAJOR, layers.topographicRelief)
    setLayerVisibility(map, LAYER_NYC_TOPO_MINOR, layers.topographicRelief)
    setLayerVisibility(map, LAYER_CURB,           layers.topographicRelief)
    setLayerVisibility(map, LAYER_CATCH,          layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_CLUSTER,  layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_COUNT,    layers.catchBasins)
    setLayerVisibility(map, LAYER_SHORE_2M,       layers.topographicRelief)
    setLayerVisibility(map, LAYER_SHORE_1M,       layers.topographicRelief)
    setLayerVisibility(map, LAYER_SHORE_HR,       layers.topographicRelief)
    setLayerVisibility(map, LAYER_CONTOURS,       layers.topographicRelief)
  }, [layers])

  // ── Curb LiDAR GeoJSON (loaded on demand when topographic layer is on) ───
  useEffect(() => {
    if (!layers.topographicRelief) {
      setCurbLoading(false)
      setCurbError(null)
      return
    }

    const map = mapRef.current
    if (!map || !readyRef.current) return

    const src = map.getSource(SOURCE_CURB) as mapboxgl.GeoJSONSource | undefined
    if (!src || curbMeshLoadedRef.current) return

    let cancelled = false
    setCurbLoading(true)
    setCurbError(null)

    fetch(CURB_GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        src.setData(data as any)
        curbMeshLoadedRef.current = true
        setCurbLoading(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[curb GeoJSON]', err)
          setCurbError(err instanceof Error ? err.message : String(err))
          setCurbLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [layers.topographicRelief, mapReady])

  if (!accessToken) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 px-6 text-center font-sans text-sm text-stone-200">
        <p className="max-w-md leading-relaxed">
          Set{' '}
          <code className="rounded border border-khaki/35 bg-zinc-900 px-1.5 py-0.5 font-medium text-honey-quartz">
            VITE_MAPBOX_ACCESS_TOKEN
          </code>{' '}
          in{' '}
          <code className="rounded border border-khaki/35 bg-zinc-900 px-1.5 py-0.5 text-chartreuse">
            frontend/.env
          </code>{' '}
          and restart the dev server.
        </p>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full min-h-0">
      <div
        ref={wrapRef}
        className="h-full w-full min-h-0"
        role="application"
        aria-label="NYC Digital Twin map"
      />

      {curbLoading && layers.topographicRelief && (
        <div className="pointer-events-none absolute top-24 right-14 z-10 flex max-w-xs items-center gap-2 rounded-lg border border-khaki/30 bg-zinc-950/90 px-3 py-1.5 text-[11px] text-stone-300 backdrop-blur-md">
          <span className="inline-block size-2.5 shrink-0 animate-spin rounded-full border-2 border-honey-quartz border-t-transparent" />
          Loading curb GeoJSON…
        </div>
      )}

      {curbError && layers.topographicRelief && !curbLoading && (
        <div className="pointer-events-none absolute top-24 right-14 z-10 max-w-xs rounded-lg border border-persimmon/40 bg-zinc-950/90 px-3 py-1.5 text-[11px] text-persimmon backdrop-blur-md">
          Curbs: {curbError}
        </div>
      )}
    </div>
  )
}
