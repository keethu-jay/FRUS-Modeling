import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  CURB_BARRIER_HEIGHT_FT_MAX,
  CURB_FOCUS_ZOOM,
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
const LAYER_CURB_SHADOW = 'eco-curb-shadow'
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
  const wrapRef      = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const readyRef     = useRef(false)
  const rainfallRef  = useRef(rainfallInches)
  const timeStepRef  = useRef(timeStep)
  const layersRef    = useRef(layers)

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

      // Curb geometry GeoJSON (PRD §7.2)
      // 200K LineStrings, WGS84. For production: upload to Mapbox Studio.
      map.addSource(SOURCE_CURB, {
        type: 'geojson',
        data: CURB_GEOJSON,
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

      // Curb as raised lip: soft shadow + brighter crest; height from barrier_height_ft (ft)
      const heightExpr: mapboxgl.ExpressionSpecification = [
        'min',
        ['coalesce', ['get', 'barrier_height_ft'], 0.08],
        CURB_BARRIER_HEIGHT_FT_MAX,
      ]

      map.addLayer({
        id: LAYER_CURB_SHADOW,
        type: 'line',
        source: SOURCE_CURB,
        minzoom: CURB_LAYER_MIN_ZOOM,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#060604',
          'line-blur': ['interpolate', ['linear'], ['zoom'], 14, 0.6, 17, 2.4],
          'line-width': [
            '*',
            ['interpolate', ['linear'], ['zoom'], CURB_LAYER_MIN_ZOOM, 1.6, 15, 3.4, 17, 5.2],
            [
              'interpolate',
              ['linear'],
              heightExpr,
              0,
              0.85,
              CURB_BARRIER_HEIGHT_FT_MAX,
              1.2,
            ],
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LAYER_MIN_ZOOM,
            0.08,
            14,
            0.22,
            15.5,
            0.38,
            17,
            0.52,
          ],
        },
      })

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
            '#8f9f72',
            0.18,
            '#b8c896',
            0.38,
            '#dce6a8',
            CURB_BARRIER_HEIGHT_FT_MAX,
            '#f7b720',
          ],
          'line-width': [
            '*',
            ['interpolate', ['linear'], ['zoom'], CURB_LAYER_MIN_ZOOM, 0.75, 15, 1.9, 17, 3.1],
            [
              'interpolate',
              ['linear'],
              heightExpr,
              0,
              0.72,
              CURB_BARRIER_HEIGHT_FT_MAX,
              1.45,
            ],
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LAYER_MIN_ZOOM,
            0.22,
            14,
            0.52,
            15.5,
            0.78,
            17,
            0.92,
          ],
        },
      })

      const lv = layersRef.current
      setLayerVisibility(map, LAYER_CURB_SHADOW, lv.curbLidar)
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
        paint: { 'raster-opacity': 0.72 },
      },
      LAYER_CURB_SHADOW, // below curb highlight stack; above flood + sinks
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
    setLayerVisibility(map, LAYER_CURB_SHADOW, layers.curbLidar)
    setLayerVisibility(map, LAYER_CURB, layers.curbLidar)
    setLayerVisibility(map, LAYER_CATCH,          layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_CLUSTER,  layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_COUNT,    layers.catchBasins)
  }, [layers])

  // When curb layer needs z≥13, ease up so toggling on actually reveals data
  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current || !layers.curbLidar) return
    if (map.getZoom() < CURB_FOCUS_ZOOM) {
      map.easeTo({ zoom: CURB_FOCUS_ZOOM, duration: 750 })
    }
  }, [mapReady, layers.curbLidar])

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
