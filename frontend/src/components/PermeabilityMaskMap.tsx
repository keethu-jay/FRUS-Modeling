/**
 * PermeabilityMaskMap — stand-alone map for the NYC permeability raster tileset.
 *
 * Renders the binary NDVI permeability mask (Tileset: keethu-j.1k71qhkf) using
 * Mapbox GL's raster-color expression:
 *   value 0 → fully transparent  (impermeable / nodata)
 *   value 1 → vibrant green      (permeable soil / vegetation)
 *
 * Controls:
 *   - Base style toggle (Dark street / Satellite)
 *   - Layer visibility toggle
 *   - Opacity slider (0 – 100 %)
 *
 * Env: VITE_MAPBOX_ACCESS_TOKEN in frontend/.env
 * Note: Vite uses import.meta.env.VITE_* — not process.env.REACT_APP_*.
 */

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { NYC_CENTER, DEFAULT_ZOOM } from '../constants'

// ── Layer constants ───────────────────────────────────────────────────────────

const TILESET_ID = 'keethu-j.1k71qhkf'
const SOURCE_ID  = 'perm-tileset'
const LAYER_ID   = 'perm-raster'

/** Emerald green — reads clearly as vegetation/soil on both dark and satellite. */
const PERMEABLE_COLOR = '#2ecc71'

const BASE_STYLES = {
  dark:      'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
} as const
type BaseStyle = keyof typeof BASE_STYLES

// ── Helpers ───────────────────────────────────────────────────────────────────

function addSource(map: mapboxgl.Map): void {
  if (map.getSource(SOURCE_ID)) return
  map.addSource(SOURCE_ID, {
    type: 'raster',
    url: `mapbox://${TILESET_ID}`,
    tileSize: 256,
  })
}

function addLayer(map: mapboxgl.Map, opacityPct: number, visible: boolean): void {
  if (map.getLayer(LAYER_ID)) return
  map.addLayer({
    id:     LAYER_ID,
    type:   'raster',
    source: SOURCE_ID,
    paint: {
      'raster-opacity': opacityPct / 100,

      /**
       * raster-value returns 8-bit luminosity [0, 255] for a standard PNG tileset.
       * raster-color-mix [1,0,0,0] reads the red channel (R=G=B for greyscale tiles).
       * Step at 127: dark pixels (impermeable/nodata) → transparent,
       *              bright pixels (permeable) → emerald green.
       * raster-color-range must match the actual data scale [0, 255].
       */
      'raster-color-mix': [1, 0, 0, 0],
      'raster-color-range': [0, 255],
      'raster-color': [
        'step',
        ['raster-value'],
        'rgba(0,0,0,0)',
        127,
        PERMEABLE_COLOR,
      ],
    },
  })
  map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PermeabilityMaskMapProps {
  /** Override token; falls back to VITE_MAPBOX_ACCESS_TOKEN env var. */
  accessToken?: string
}

export default function PermeabilityMaskMap({
  accessToken,
}: PermeabilityMaskMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)

  // Refs keep effects stable without adding them as deps that trigger re-runs.
  const visibleRef = useRef(true)
  const opacityRef = useRef(75)

  const [mapReady,  setMapReady]  = useState(false)
  const [visible,   setVisible]   = useState(true)
  const [opacity,   setOpacity]   = useState(75)
  const [baseStyle, setBaseStyle] = useState<BaseStyle>('dark')

  const token = accessToken ?? (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined)

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style:     BASE_STYLES.dark,
      center:    NYC_CENTER,
      zoom:      DEFAULT_ZOOM,
      minZoom:   9,
      maxZoom:   18,
      maxBounds: [[-74.65, 40.35], [-73.30, 41.10]],
    })

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), 'top-right')

    map.on('load', () => {
      addSource(map)
      addLayer(map, opacityRef.current, visibleRef.current)
      setMapReady(true)
    })

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Base style switch — re-add source + layer after style reload ────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    setMapReady(false)
    map.setStyle(BASE_STYLES[baseStyle])
    map.once('style.load', () => {
      addSource(map)
      addLayer(map, opacityRef.current, visibleRef.current)
      setMapReady(true)
    })
  }, [baseStyle]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility ──────────────────────────────────────────────────────────────
  useEffect(() => {
    visibleRef.current = visible
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer(LAYER_ID)) return
    map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }, [visible, mapReady])

  // ── Opacity ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    opacityRef.current = opacity
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer(LAYER_ID)) return
    map.setPaintProperty(LAYER_ID, 'raster-opacity', opacity / 100)
  }, [opacity, mapReady])

  // ── No token guard ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 px-6 text-center font-sans text-sm text-stone-400">
        <p className="max-w-sm leading-relaxed">
          Set{' '}
          <code className="rounded border border-emerald-800/50 bg-zinc-900 px-1.5 py-0.5 text-emerald-400">
            VITE_MAPBOX_ACCESS_TOKEN
          </code>{' '}
          in{' '}
          <code className="rounded border border-white/10 bg-zinc-900 px-1.5 py-0.5 text-stone-300">
            frontend/.env
          </code>{' '}
          and restart the dev server.
        </p>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      {/* Mapbox canvas */}
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="NYC permeability mask map"
      />

      {/* ── Control panel ─────────────────────────────────────── */}
      <div className="absolute bottom-8 left-4 z-10 flex w-60 flex-col gap-3 rounded-2xl border border-white/10 bg-zinc-950/85 p-4 shadow-2xl backdrop-blur-md font-sans">

        {/* Title row + visibility toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full bg-emerald-400"
              style={{ boxShadow: `0 0 7px 1px ${PERMEABLE_COLOR}` }}
            />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-stone-200">
              Permeability
            </span>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={visible}
            aria-label={visible ? 'Hide mask layer' : 'Show mask layer'}
            onClick={() => setVisible(v => !v)}
            className={[
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950',
              visible ? 'bg-emerald-500' : 'bg-zinc-700',
            ].join(' ')}
          >
            <span
              className={[
                'pointer-events-none inline-block size-4 rounded-full bg-white shadow',
                'transition-transform duration-200',
                visible ? 'translate-x-4' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Opacity slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-stone-500">Opacity</span>
            <span className="tabular-nums text-stone-300">{opacity}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacity}
            disabled={!visible}
            onChange={e => setOpacity(Number(e.target.value))}
            aria-label="Mask opacity"
            className="w-full cursor-pointer accent-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          />
        </div>

        {/* Base style switcher */}
        <div className="grid grid-cols-2 gap-1.5 border-t border-white/10 pt-3">
          {(['dark', 'satellite'] as const).map(style => (
            <button
              key={style}
              type="button"
              onClick={() => setBaseStyle(style)}
              className={[
                'rounded-lg py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-all duration-150',
                baseStyle === style
                  ? 'bg-emerald-600/25 text-emerald-300 ring-1 ring-emerald-500/50'
                  : 'bg-zinc-800/60 text-stone-500 hover:bg-zinc-700/60 hover:text-stone-300',
              ].join(' ')}
            >
              {style === 'dark' ? 'Dark' : 'Satellite'}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 border-t border-white/10 pt-2.5">
          <div className="flex items-center gap-1.5 text-[10px] text-stone-400">
            <span
              className="inline-block size-2.5 shrink-0 rounded-sm"
              style={{ background: PERMEABLE_COLOR, opacity: 0.9 }}
            />
            Permeable
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
            <span className="inline-block size-2.5 shrink-0 rounded-sm bg-zinc-700 ring-1 ring-white/10" />
            Impermeable
          </div>
        </div>
      </div>
    </div>
  )
}
