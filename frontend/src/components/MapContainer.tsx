import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  CURB_BARRIER_HEIGHT_FT_MAX,
  CURB_LINE_DETAIL_ZOOM,
  CURB_LINE_MIN_ZOOM,
  DEFAULT_ZOOM,
  NYC_CENTER,
  RAIN_INCH_MAX,
  RAIN_INCH_MIN,
  maxShapefileZipBytes,
} from '../constants'
import { floodTileUrlTemplate } from '../lib/tileUrl'
import { publicAssetUrl } from '../lib/publicAssetUrl'
import { loadShapefileZipAsGeoJson } from '../lib/shapefileZip'
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

const SOURCE_FLOOD = 'flood-depth'
const SOURCE_MASK_ZIP = 'mask-vector-zip-geojson'
const SOURCE_CURB    = 'curb-lidar'
const SOURCE_CATCH   = 'catch-basins'

const LAYER_MASK_ZIP_FILL = 'eco-mask-zip-fill'
const LAYER_MASK_ZIP_LINES = 'eco-mask-zip-lines'
const LAYER_FLOOD    = 'eco-flood-raster'
const LAYER_CURB     = 'eco-curb-lines'
const LAYER_CATCH         = 'eco-catch-points'
const LAYER_CATCH_CLUSTER = 'eco-catch-clusters'
const LAYER_CATCH_COUNT   = 'eco-catch-count'

const CATCH_GEOJSON = publicAssetUrl('data/vectors/catch_basins.geojson')

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] as [] }

function logFeatureCollectionDebug(label: string, fc: { features: unknown[] }) {
  const types = new Set<string>()
  const n = Math.min(5000, fc.features.length)
  for (let i = 0; i < n; i++) {
    const g = (fc.features[i] as { geometry?: { type?: string } } | undefined)?.geometry
    const t = g?.type
    if (t) types.add(t)
  }
  console.info(`[${label}] feature count:`, fc.features.length, 'geometry types (sampled):', [...types].sort())
}

const CURB_GEOJSON_URL = publicAssetUrl(
  ((import.meta.env.VITE_CURBS_GEOJSON as string | undefined)?.trim() || 'data/vectors/curbs.geojson').replace(
    /^\/+/,
    '',
  ),
)

const MASK_VECTOR_ZIP_URL = publicAssetUrl(
  ((import.meta.env.VITE_MASK_VECTOR_ZIP as string | undefined)?.trim() || 'data/mask_vector.zip').replace(
    /^\/+/,
    '',
  ),
)

function setLayerVisibility(map: mapboxgl.Map, layerId: string, on: boolean) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
}

/**
 * Flood PNG tiles must exist under `public/data/flood/{n}in_{t}min/...` or every request
 * returns the SPA HTML (Vite) and Mapbox throws “source image could not be decoded”.
 * When rainfall is off, remove the raster source entirely so no tiles are requested.
 */
function applyFloodScenario(map: mapboxgl.Map, rainfallInches: number, timeStep: number) {
  const wantFlood = rainfallInches >= 1
  if (!wantFlood) {
    if (map.getLayer(LAYER_FLOOD)) map.removeLayer(LAYER_FLOOD)
    if (map.getSource(SOURCE_FLOOD)) map.removeSource(SOURCE_FLOOD)
    return
  }

  const r = Math.min(
    RAIN_INCH_MAX,
    Math.max(RAIN_INCH_MIN, Math.round(rainfallInches)),
  )
  const tileUrl = floodTileUrlTemplate(r, timeStep)

  if (!map.getSource(SOURCE_FLOOD)) {
    map.addSource(SOURCE_FLOOD, {
      type: 'raster',
      tiles: [tileUrl],
      tileSize: 256,
    })
    map.addLayer(
      {
        id: LAYER_FLOOD,
        type: 'raster',
        source: SOURCE_FLOOD,
        paint: { 'raster-opacity': 0.92 },
      },
      LAYER_CATCH_CLUSTER,
    )
  } else {
    const src = map.getSource(SOURCE_FLOOD) as mapboxgl.RasterTileSource
    src.setTiles?.([tileUrl])
    if (map.getLayer(LAYER_FLOOD)) {
      map.setPaintProperty(LAYER_FLOOD, 'raster-opacity', 0.92)
    }
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
  const layersRef = useRef(layers)
  const curbMeshLoadedRef = useRef(false)
  const maskZipLoadedRef = useRef(false)

  const [mapReady, setMapReady] = useState(false)
  const [curbLoading, setCurbLoading] = useState(false)
  const [curbError, setCurbError] = useState<string | null>(null)

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

    map.on('error', (e) => {
      const ev = e as { error?: Error; sourceId?: string; tile?: { tileID?: unknown } }
      console.warn(
        '[mapbox error]',
        ev.sourceId ?? '',
        ev.tile?.tileID ?? '',
        ev.error?.message ?? ev.error ?? e,
      )
    })

    map.on('load', () => {
      map.setCenter(NYC_CENTER)
      map.setZoom(15)

      const topoSpecs = topoTilesetSpecs()

        // ── Sources (flood raster only when rainfall ≥ 1 — see applyFloodScenario) ──

        map.addSource(SOURCE_CURB, {
          type: 'geojson',
          data: EMPTY_FC,
          generateId: true,
        })

        map.addSource(SOURCE_CATCH, {
          type: 'geojson',
          data: CATCH_GEOJSON,
          cluster: true,
          clusterRadius: 50,
          clusterMaxZoom: 14,
        })

        map.addSource(SOURCE_MASK_ZIP, {
          type: 'geojson',
          data: EMPTY_FC,
        })

        // ── Layers: flood is added only when rainfall ≥ 1 (applyFloodScenario) ──

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
          // Mapbox v3: `['zoom']` may only appear as input to a top-level interpolate/step — not inside `*`.
          // Width follows zoom only (height still drives `line-color`).
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LINE_MIN_ZOOM,
            2.8,
            CURB_LINE_DETAIL_ZOOM,
            1.05,
            15,
            2.6,
            17,
            4.1,
          ] as mapboxgl.ExpressionSpecification,
          'line-blur': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LINE_MIN_ZOOM,
            1.75,
            CURB_LINE_DETAIL_ZOOM,
            0.35,
            16,
            0,
          ],
          'line-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            CURB_LINE_MIN_ZOOM,
            0.52,
            CURB_LINE_DETAIL_ZOOM,
            0.4,
            14,
            0.74,
            15.5,
            0.88,
            17,
            0.96,
          ],
        },
      })

        const fillGeomFilter: mapboxgl.ExpressionSpecification = [
          'match',
          ['geometry-type'],
          'Polygon',
          true,
          'MultiPolygon',
          true,
          false,
        ]

        const lineGeomFilter: mapboxgl.ExpressionSpecification = [
          'match',
          ['geometry-type'],
          'LineString',
          true,
          'MultiLineString',
          true,
          false,
        ]

        for (const spec of topoSpecs) {
          const srcId = topoVectorSourceId(spec.key)
          map.addSource(srcId, {
            type: 'vector',
            url: `mapbox://${spec.tilesetId}`,
          })
          map.addLayer({
            id: topoFillLayerId(spec.key),
            type: 'fill',
            source: srcId,
            'source-layer': spec.sourceLayer,
            filter: fillGeomFilter,
            paint: {
              'fill-color': '#4a148c',
              'fill-opacity': 0.38,
              'fill-outline-color': '#4a148c',
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
              'line-color': '#4a148c',
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                14,
                1,
                18,
                5,
              ] as mapboxgl.ExpressionSpecification,
            },
          })
        }

        map.addLayer({
          id: LAYER_MASK_ZIP_FILL,
          type: 'fill',
          source: SOURCE_MASK_ZIP,
          filter: fillGeomFilter,
          paint: {
            'fill-color': '#00e676',
            'fill-opacity': 0.42,
            'fill-outline-color': '#00e676',
            'fill-antialias': true,
          },
        })

        map.addLayer({
          id: LAYER_MASK_ZIP_LINES,
          type: 'line',
          source: SOURCE_MASK_ZIP,
          filter: lineGeomFilter,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#00e676',
            'line-width': 2,
          },
        })

        const lv = layersRef.current
        for (const id of allTopoVectorLayerIds(topoSpecs)) {
          setLayerVisibility(map, id, lv.topographicRelief)
        }
        setLayerVisibility(map, LAYER_CURB, lv.topographicRelief)
        setLayerVisibility(map, LAYER_CATCH, lv.catchBasins)
        setLayerVisibility(map, LAYER_CATCH_CLUSTER, lv.catchBasins)
        setLayerVisibility(map, LAYER_CATCH_COUNT, lv.catchBasins)
        setLayerVisibility(map, LAYER_MASK_ZIP_FILL, lv.permeabilityNdvi)
        setLayerVisibility(map, LAYER_MASK_ZIP_LINES, lv.permeabilityNdvi)

        readyRef.current = true
        setMapReady(true)
        applyFloodScenario(map, rainfallRef.current, timeStepRef.current)

        if (import.meta.env.DEV) {
          console.info(
            '[Eco-Sentry] Topo Mapbox vector tilesets:',
            mapboxTopoUsername(),
            `(${topoSpecs.length} sources)`,
            'Mask zip:',
            MASK_VECTOR_ZIP_URL,
          )
          map.on('click', (ev) => {
            const features = map.queryRenderedFeatures(ev.point)
            console.info('[Eco-Sentry click debug] features[0].properties:', features[0]?.properties)
          })
        }
    })

    mapRef.current = map

    return () => {
      readyRef.current = false
      curbMeshLoadedRef.current = false
      maskZipLoadedRef.current = false
      setMapReady(false)
      map.remove()
      mapRef.current = null
    }
  }, [accessToken])

  // ── Flood scenario updates ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    applyFloodScenario(map, rainfallInches, timeStep)
  }, [rainfallInches, timeStep])

  // ── Layer visibility ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    setLayerVisibility(map, LAYER_MASK_ZIP_FILL, layers.permeabilityNdvi)
    setLayerVisibility(map, LAYER_MASK_ZIP_LINES, layers.permeabilityNdvi)
    for (const id of allTopoVectorLayerIds(topoTilesetSpecs())) {
      setLayerVisibility(map, id, layers.topographicRelief)
    }
    setLayerVisibility(map, LAYER_CURB, layers.topographicRelief)
    setLayerVisibility(map, LAYER_CATCH,          layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_CLUSTER,  layers.catchBasins)
    setLayerVisibility(map, LAYER_CATCH_COUNT,    layers.catchBasins)
  }, [layers])

  // ── Mask shapefile .zip → GeoJSON (shpjs) ──────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    let cancelled = false

    void (async () => {
      const zipLimit = maxShapefileZipBytes()

      if (!maskZipLoadedRef.current) {
        try {
          const fc = await loadShapefileZipAsGeoJson(MASK_VECTOR_ZIP_URL, {
            maxZipBytes: zipLimit,
          })
          if (cancelled || !fc) return
          const src = map.getSource(SOURCE_MASK_ZIP) as mapboxgl.GeoJSONSource | undefined
          if (!src) return
          if (fc.features.length === 0) {
            console.warn('[mask_vector.zip] Parsed OK but feature collection is empty.')
          } else {
            logFeatureCollectionDebug('mask_vector.zip', fc)
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          src.setData(fc as any)
          maskZipLoadedRef.current = true
        } catch (e) {
          console.warn('[mask_vector.zip] Not loaded (missing file or invalid zip):', e)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mapReady])

  useEffect(() => {
    if (!layers.topographicRelief) {
      setCurbLoading(false)
      setCurbError(null)
      return
    }

    const map = mapRef.current
    if (!map || !readyRef.current) return

    const src = map.getSource(SOURCE_CURB) as mapboxgl.GeoJSONSource | undefined
    if (!src) return

    if (curbMeshLoadedRef.current) return

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Mapbox accepts standard GeoJSON objects
        src.setData(data as any)
        curbMeshLoadedRef.current = true
        setCurbLoading(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('[curb GeoJSON]', err)
          const msg = err instanceof Error ? err.message : String(err)
          setCurbError(msg)
          setCurbLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
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
        aria-label="Eco-Sentry NYC map"
      />

      {curbLoading && layers.topographicRelief && (
        <div className="pointer-events-none absolute top-24 right-14 z-10 flex max-w-xs items-center gap-2 rounded-lg border border-khaki/30 bg-zinc-950/90 px-3 py-1.5 text-[11px] text-stone-300 backdrop-blur-md">
          <span className="inline-block size-2.5 shrink-0 animate-spin rounded-full border-2 border-honey-quartz border-t-transparent" />
          Loading curb GeoJSON (can take a bit for the full mesh)…
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
