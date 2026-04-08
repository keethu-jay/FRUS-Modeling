import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { DEFAULT_ZOOM, NYC_CENTER } from '../constants.js'
import { floodTileUrlTemplate, orthoMaskTileUrlTemplate } from '../lib/tileUrl.js'

const STYLE = 'mapbox://styles/mapbox/dark-v11'

const SOURCE_FLOOD = 'flood-depth'
const SOURCE_NDVI = 'permeability-ndvi'
const SOURCE_CURB = 'curb-lidar'
const SOURCE_CATCH = 'catch-basins'

const LAYER_NDVI = 'eco-ndvi-raster'
const LAYER_CURB = 'eco-curb-lines'
const LAYER_FLOOD = 'eco-flood-raster'
const LAYER_CATCH = 'eco-catch-points'

function setLayerVisibility(map, layerId, on) {
  if (!map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', on ? 'visible' : 'none')
}

function applyFloodScenario(map, rainfallInches, timeStep) {
  const src = map.getSource(SOURCE_FLOOD)
  if (!src || typeof src.setTiles !== 'function') return
  const url = floodTileUrlTemplate(rainfallInches, timeStep)
  src.setTiles([url])
  const show = rainfallInches >= 0.05
  if (map.getLayer(LAYER_FLOOD)) {
    map.setPaintProperty(LAYER_FLOOD, 'raster-opacity', show ? 0.92 : 0)
  }
}

export default function MapContainer({
  rainfallInches,
  timeStep,
  layers,
  accessToken,
}) {
  const wrapRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const rainfallRef = useRef(rainfallInches)
  const timeStepRef = useRef(timeStep)
  const layersRef = useRef(layers)

  useEffect(() => {
    rainfallRef.current = rainfallInches
    timeStepRef.current = timeStep
    layersRef.current = layers
  }, [rainfallInches, timeStep, layers])

  useEffect(() => {
    if (!accessToken || !wrapRef.current) return

    mapboxgl.accessToken = accessToken

    const map = new mapboxgl.Map({
      container: wrapRef.current,
      style: STYLE,
      center: NYC_CENTER,
      zoom: DEFAULT_ZOOM,
      attributionControl: true,
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      const floodTiles = [
        floodTileUrlTemplate(rainfallRef.current, timeStepRef.current),
      ]

      map.addSource(SOURCE_FLOOD, {
        type: 'raster',
        tiles: floodTiles,
        tileSize: 256,
      })

      map.addSource(SOURCE_NDVI, {
        type: 'raster',
        tiles: [orthoMaskTileUrlTemplate()],
        tileSize: 256,
      })

      map.addSource(SOURCE_CURB, {
        type: 'geojson',
        data: '/data/curb_geometry.geojson',
      })

      map.addSource(SOURCE_CATCH, {
        type: 'geojson',
        data: '/data/catch_basins.geojson',
      })

      map.addLayer({
        id: LAYER_NDVI,
        type: 'raster',
        source: SOURCE_NDVI,
        paint: { 'raster-opacity': 0.55 },
      })

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
        paint: {
          'raster-opacity': rainfallRef.current >= 0.05 ? 0.92 : 0,
        },
      })

      map.addLayer({
        id: LAYER_CATCH,
        type: 'circle',
        source: SOURCE_CATCH,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 4],
          'circle-color': '#F7B720',
          'circle-opacity': 0.62,
          'circle-stroke-width': 0.5,
          'circle-stroke-color': '#42421E',
        },
      })

      const lv = layersRef.current
      setLayerVisibility(map, LAYER_NDVI, lv.permeabilityNdvi)
      setLayerVisibility(map, LAYER_CURB, lv.curbLidar)
      setLayerVisibility(map, LAYER_CATCH, lv.catchBasins)

      readyRef.current = true
      applyFloodScenario(map, rainfallRef.current, timeStepRef.current)
    })

    mapRef.current = map

    return () => {
      readyRef.current = false
      map.remove()
      mapRef.current = null
    }
  }, [accessToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current) return
    applyFloodScenario(map, rainfallInches, timeStep)
  }, [rainfallInches, timeStep])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded() || !readyRef.current) return
    setLayerVisibility(map, LAYER_NDVI, layers.permeabilityNdvi)
    setLayerVisibility(map, LAYER_CURB, layers.curbLidar)
    setLayerVisibility(map, LAYER_CATCH, layers.catchBasins)
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
    <div
      ref={wrapRef}
      className="h-full w-full min-h-0"
      role="application"
      aria-label="Eco-Sentry NYC map"
    />
  )
}
