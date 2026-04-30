import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { DEFAULT_ZOOM, NYC_CENTER } from '../constants'
import { floodTileUrlTemplate } from '../lib/tileUrl'
import { useGeoTiffMask } from '../hooks/useGeoTiffMask'
import type { LayerVisibility } from '../types'

const STYLE = 'mapbox://styles/mapbox/dark-v11'

const SOURCE_MASK  = 'permeability-mask'
const SOURCE_FLOOD = 'flood-depth'
const SOURCE_CURB  = 'curb-lidar'
const SOURCE_CATCH = 'catch-basins'

const LAYER_MASK          = 'eco-mask-raster'
const LAYER_CURB          = 'eco-curb-lines'
const LAYER_FLOOD         = 'eco-flood-raster'
const LAYER_CATCH         = 'eco-catch-points'
const LAYER_CATCH_CLUSTER = 'eco-catch-clusters'
const LAYER_CATCH_COUNT   = 'eco-catch-count'

// PRD §7.2 — vector paths under /data/vectors/
const CURB_GEOJSON  = '/data/vectors/curbs.geojson'
const CATCH_GEOJSON = '/data/vectors/catch_basins.geojson'

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
  const wrapRef   = useRef<HTMLDivElement>(null)
  const mapRef    = useRef<mapboxgl.Map | null>(null)
  const readyRef  = useRef(false)
  const rainfallRef  = useRef(rainfallInches)
  const timeStepRef  = useRef(timeStep)
  const layersRef    = useRef(layers)

  const [mapReady, setMapReady] = useState(false)

  // Load final_mask.tif in the browser — rendered as chartreuse overlay
  const { result: maskResult, loading: maskLoading, error: maskError } = useGeoTiffMask(
    '/data/final_mask.tif',
  )

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
      // Flood depth tiled raster (PRD §7.1)
      map.addSource(SOURCE_FLOOD, {
        type: 'raster',
        tiles: [floodTileUrlTemplate(rainfallRef.current, timeStepRef.current)],
        tileSize: 256,
      })

      // Curb geometry GeoJSON (PRD §7.2 — vectors/)
      map.addSource(SOURCE_CURB, {
        type: 'geojson',
        data: CURB_GEOJSON,
      })

      // Catch basin sinks GeoJSON — clustered for 154K points (PRD §7.2)
      map.addSource(SOURCE_CATCH, {
        type: 'geojson',
        data: CATCH_GEOJSON,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      })

      // Layer stack bottom→top: curb → flood → catch
      // LAYER_MASK inserted below LAYER_CURB once GeoTIFF loads
      map.addLayer({
        id: LAYER_CURB,
        type: 'line',
        source: SOURCE_CURB,
        paint: {
          'line-color': '#D8CF00',
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 16, 1.2],
          'line-opacity': 0.88,
        },
      })

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

      const lv = layersRef.current
      setLayerVisibility(map, LAYER_CURB,          lv.curbLidar)
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
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [accessToken])

  // ── Add permeability mask (GeoTIFF) once both map + TIF are ready ────────
  useEffect(() => {
    if (!mapReady || !maskResult || !mapRef.current) return
    const map = mapRef.current
    if (map.getSource(SOURCE_MASK)) return

    map.addSource(SOURCE_MASK, {
      type: 'image',
      url: maskResult.imageUrl,
      coordinates: maskResult.coordinates,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    map.addLayer(
      {
        id: LAYER_MASK,
        type: 'raster',
        source: SOURCE_MASK,
        paint: { 'raster-opacity': 0.65 },
      },
      LAYER_CURB, // insert below curb lines
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
    setLayerVisibility(map, LAYER_MASK,         layers.permeabilityNdvi)
    setLayerVisibility(map, LAYER_CURB,         layers.curbLidar)
    setLayerVisibility(map, LAYER_CATCH,         layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_CLUSTER, layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_COUNT,   layers.catchBasins)
  }, [layers])

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
          Mask error: {maskError}
        </div>
      )}
    </div>
  )
}
