import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  CURB_BARRIER_HEIGHT_FT_MAX,
  CURB_DATA_BOUNDS,
  CURB_LAYER_MIN_ZOOM,
  DEFAULT_ZOOM,
  NYC_CENTER,
} from '../constants'
import { floodTileUrlTemplate } from '../lib/tileUrl'
import { useGeoTiffMask } from '../hooks/useGeoTiffMask'
import type { LayerVisibility } from '../types'

const STYLE = 'mapbox://styles/mapbox/dark-v11'

const SOURCE_MASK  = 'permeability-mask'
const SOURCE_FLOOD = 'flood-depth'
const SOURCE_CURB  = 'curb-lidar'
const SOURCE_CATCH = 'catch-basins'

const LAYER_MASK          = 'eco-mask-raster'
const LAYER_CURB_HEATMAP = 'eco-curb-heatmap'
const LAYER_CURB        = 'eco-curb-lines'
const LAYER_FLOOD         = 'eco-flood-raster'
const LAYER_CATCH         = 'eco-catch-points'
const LAYER_CATCH_CLUSTER = 'eco-catch-clusters'
const LAYER_CATCH_COUNT   = 'eco-catch-count'

// PRD §7.2 — curb mesh served as decimated GeoJSON (see scripts/clip_curbs_subset.py)
const CURB_GEOJSON_URL = '/data/vectors/curbs_web.geojson'
const CATCH_GEOJSON = '/data/vectors/catch_basins.geojson'

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as [] }

/** Pilot curb GeoJSON has finite extent — skip camera jump if viewport overlaps mesh bbox */
function viewportShowsCurbPilotExtent(map: mapboxgl.Map): boolean {
  const v = map.getBounds()
  if (!v) return false
  const vw = v.getWest()
  const ve = v.getEast()
  const vs = v.getSouth()
  const vn = v.getNorth()

  const mw = CURB_DATA_BOUNDS[0][0]
  const ms = CURB_DATA_BOUNDS[0][1]
  const me = CURB_DATA_BOUNDS[1][0]
  const mn = CURB_DATA_BOUNDS[1][1]

  return !(ve < mw || vw > me || vn < ms || vs > mn)
}

function setLayerVisibility(map: mapboxgl.Map, layerId: string, on: boolean) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
}

function applyFloodScenario(map: mapboxgl.Map, rainfallInches: number, timeStep: number) {
  const src = map.getSource(SOURCE_FLOOD) as mapboxgl.RasterTileSource | undefined
  if (!src?.setTiles) return
  src.setTiles([floodTileUrlTemplate(rainfallInches, timeStep)])
  if (map.getLayer(LAYER_FLOOD)) {
    map.setPaintProperty(LAYER_FLOOD, 'raster-opacity', rainfallInches >= 1 ? 0.92 : 0)
  }
}

interface MapContainerProps {
  accessToken: string
  rainfallInches: number
  timeStep: number
  layers: LayerVisibility
}

export default function MapContainer({
  accessToken,
  rainfallInches,
  timeStep,
  layers,
}: MapContainerProps) {
  const wrapRef      = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const readyRef     = useRef(false)
  const rainfallRef  = useRef(rainfallInches)
  const timeStepRef  = useRef(timeStep)
  const layersRef    = useRef(layers)
  const curbFetchRef = useRef<'idle' | 'loading' | 'ready' | 'error'>('idle')

  const [mapReady, setMapReady] = useState(false)

  // Decode final_mask.tif in the browser → explicit green pixels on canvas
  const { result: maskResult, loading: maskLoading, error: maskError } =
    useGeoTiffMask('/data/final_mask.tif')

  useEffect(() => {
    rainfallRef.current = rainfallInches
    timeStepRef.current = timeStep
    layersRef.current   = layers
  }, [rainfallInches, timeStep, layers])

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
      // Constrain panning to NYC + immediate surroundings
      maxBounds: [
        [-74.65, 40.35],   // SW — Staten Island + Newark
        [-73.30, 41.10],   // NE — Bronx + western Long Island
      ],
      attributionControl: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      // ── Sources ────────────────────────────────────────────────────────────

      // Flood depth tiled raster (PRD §7.1)
      map.addSource(SOURCE_FLOOD, {
        type: 'raster',
        tiles: [floodTileUrlTemplate(rainfallRef.current, timeStepRef.current)],
        tileSize: 256,
      })

      // Curb LiDAR — loaded lazily when the user enables the layer (see curb fetch effect).
      map.addSource(SOURCE_CURB, {
        type: 'geojson',
        data: EMPTY_FC,
        generateId: true,
      })

      // Catch basin sinks GeoJSON — clustered for 154K points (PRD §7.2)
      map.addSource(SOURCE_CATCH, {
        type: 'geojson',
        data: CATCH_GEOJSON,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      })

      // ── Layer stack (bottom → top) ─────────────────────────────────────────
      // NOTE: LAYER_MASK is added later via the maskResult effect (once the
      // GeoTIFF has been decoded and rendered to a canvas image).
      //
      // Flood raster must sit BELOW curb lines — otherwise ~0.92 opacity depth
      // tiles paint over the LiDAR skeleton and it looks like curbs "do nothing".

      map.addLayer({
        id: LAYER_FLOOD,
        type: 'raster',
        source: SOURCE_FLOOD,
        paint: { 'raster-opacity': rainfallRef.current >= 1 ? 0.92 : 0 },
      })

      // Cluster bubbles (zoom ≤ 14)
      map.addLayer({
        id: LAYER_CATCH_CLUSTER,
        type: 'circle',
        source: SOURCE_CATCH,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': [
            'step', ['get', 'point_count'],
            '#F7B720',   100,
            '#F7A020',   500,
            '#F76820',
          ],
          'circle-radius': [
            'step', ['get', 'point_count'],
            10,   100,
            14,   500,
            20,
          ],
          'circle-opacity': 0.82,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#42421E',
        },
      })

      // Cluster count labels
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
        paint: {
          'text-color': '#1a1a0a',
        },
      })

      // Individual points (zoom > 14, unclustered)
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

      // Height must be numeric for interpolate — coerce GeoJSON properties safely for Mapbox GL.
      const heightExpr: mapboxgl.ExpressionSpecification = [
        'min',
        ['max', 0, ['to-number', ['get', 'barrier_height_ft'], 0.08]],
        CURB_BARRIER_HEIGHT_FT_MAX,
      ]

      // Purple heatmap “terrain wash” from LiDAR-derived curb barrier weights
      map.addLayer({
        id: LAYER_CURB_HEATMAP,
        type: 'heatmap',
        source: SOURCE_CURB,
        minzoom: 11,
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            heightExpr,
            0,
            0.2,
            CURB_BARRIER_HEIGHT_FT_MAX,
            1,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            0.35,
            13,
            0.75,
            15,
            1.25,
            17,
            1.85,
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            10,
            13,
            22,
            15,
            34,
            17,
            48,
          ],
          'heatmap-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            11,
            0.28,
            13,
            0.42,
            15,
            0.52,
            17,
            0.48,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(139, 92, 246, 0)',
            0.12,
            'rgba(237, 233, 254, 0.35)',
            0.28,
            'rgba(196, 181, 253, 0.52)',
            0.45,
            'rgba(167, 139, 250, 0.68)',
            0.62,
            'rgba(126, 58, 242, 0.78)',
            0.82,
            'rgba(91, 33, 182, 0.86)',
            1,
            'rgba(59, 7, 100, 0.9)',
          ],
        },
      })

      // Street-scale curb lip: darker purple = higher barrier_height_ft
      map.addLayer({
        id: LAYER_CURB,
        type: 'line',
        source: SOURCE_CURB,
        minzoom: CURB_LAYER_MIN_ZOOM,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': [
            'interpolate',
            ['linear'],
            heightExpr,
            0,
            '#ede9fe',
            0.12,
            '#ddd6fe',
            0.28,
            '#c4b5fd',
            0.48,
            '#a78bfa',
            CURB_BARRIER_HEIGHT_FT_MAX,
            '#5b21b6',
          ],
          'line-width': [
            '*',
            ['interpolate', ['linear'], ['zoom'], CURB_LAYER_MIN_ZOOM, 0.85, 15, 2.2, 17, 3.6],
            [
              'interpolate',
              ['linear'],
              heightExpr,
              0,
              0.85,
              CURB_BARRIER_HEIGHT_FT_MAX,
              1.55,
            ],
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LAYER_MIN_ZOOM,
            0.38,
            14,
            0.72,
            15.5,
            0.88,
            17,
            0.96,
          ],
        },
      })

      const lv = layersRef.current
      setLayerVisibility(map, LAYER_CURB_HEATMAP, lv.curbLidar)
      setLayerVisibility(map, LAYER_CURB, lv.curbLidar)
      setLayerVisibility(map, LAYER_CATCH,          lv.catchBasins)
      setLayerVisibility(map, LAYER_CATCH_CLUSTER,  lv.catchBasins)
      setLayerVisibility(map, LAYER_CATCH_COUNT,    lv.catchBasins)

      readyRef.current = true
      setMapReady(true)
      applyFloodScenario(map, rainfallRef.current, timeStepRef.current)
    })

    mapRef.current = map

    return () => {
      readyRef.current = false
      curbFetchRef.current = 'idle'
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [accessToken])

  // ── Add permeability mask once GeoTIFF decoded + map ready ───────────────
  useEffect(() => {
    if (!mapReady || !maskResult || !mapRef.current) return
    const map = mapRef.current
    if (map.getSource(SOURCE_MASK)) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.addSource(SOURCE_MASK, {
      type: 'image',
      url: maskResult.imageUrl,
      coordinates: maskResult.coordinates,
    } as any)

    map.addLayer(
      {
        id: LAYER_MASK,
        type: 'raster',
        source: SOURCE_MASK,
        paint: { 'raster-opacity': 0.82 },
      },
      // Sit directly above flood so permeability is not sandwiched under dense vectors
      LAYER_CATCH_CLUSTER,
    )

    setLayerVisibility(map, LAYER_MASK, layersRef.current.permeabilityNdvi)
  }, [mapReady, maskResult])

  // ── Flood scenario updates ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current) return
    applyFloodScenario(map, rainfallInches, timeStep)
  }, [rainfallInches, timeStep])

  // ── Layer visibility ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current) return
    setLayerVisibility(map, LAYER_MASK,          layers.permeabilityNdvi)
    setLayerVisibility(map, LAYER_CURB_HEATMAP, layers.curbLidar)
    setLayerVisibility(map, LAYER_CURB, layers.curbLidar)
    setLayerVisibility(map, LAYER_CATCH,          layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_CLUSTER,  layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_COUNT,    layers.catchBasins)
  }, [layers])

  // Lazy-fetch curb mesh + fly to pilot extent (mesh is not citywide — see CURB_DATA_BOUNDS).
  useEffect(() => {
    if (!layers.curbLidar) {
      if (curbFetchRef.current === 'error') curbFetchRef.current = 'idle'
      return
    }

    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current) return

    const src = map.getSource(SOURCE_CURB) as mapboxgl.GeoJSONSource | undefined
    if (!src) return

    let cancelled = false

    const flyToCurbs = () => {
      if (cancelled || !layersRef.current.curbLidar) return
      if (viewportShowsCurbPilotExtent(map)) return
      map.fitBounds(CURB_DATA_BOUNDS as mapboxgl.LngLatBoundsLike, {
        padding: 56,
        duration: 950,
        maxZoom: 17,
      })
    }

    if (curbFetchRef.current === 'ready') {
      flyToCurbs()
      return () => {
        cancelled = true
      }
    }

    if (curbFetchRef.current === 'loading') {
      return () => {
        cancelled = true
      }
    }

    curbFetchRef.current = 'loading'

    fetch(CURB_GEOJSON_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        if (cancelled) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mapbox accepts standard GeoJSON objects
        src.setData(data as any)
        curbFetchRef.current = 'ready'
        flyToCurbs()
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[curb GeoJSON]', err)
          curbFetchRef.current = 'error'
        }
      })
      .finally(() => {
        if (cancelled && curbFetchRef.current === 'loading') {
          curbFetchRef.current = 'idle'
        }
      })

    return () => {
      cancelled = true
    }
  }, [layers.curbLidar, mapReady])

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
        aria-label="Eco-Sentry NYC map"
      />

      {maskLoading && (
        <div className="pointer-events-none absolute top-3 right-14 z-10 flex items-center gap-2 rounded-full border border-khaki/30 bg-zinc-950/85 px-3 py-1.5 text-[11px] text-stone-300 backdrop-blur-md">
          <span className="inline-block size-2.5 animate-spin rounded-full border-2 border-chartreuse border-t-transparent" />
          Loading permeability mask…
        </div>
      )}

      {maskError && !maskLoading && (
        <div className="pointer-events-none absolute top-3 right-14 z-10 max-w-xs rounded-lg border border-persimmon/40 bg-zinc-950/90 px-3 py-1.5 text-[11px] text-persimmon backdrop-blur-md">
          Mask: {maskError}
        </div>
      )}
    </div>
  )
}
