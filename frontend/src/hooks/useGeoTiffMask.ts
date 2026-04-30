import { useEffect, useRef, useState } from 'react'
import { fromArrayBuffer } from 'geotiff'
import proj4 from 'proj4'
import type { GeoTiffMaskResult } from '../types'

// Common projections used for NYC geospatial data
proj4.defs([
  ['EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs'],
  ['EPSG:4269', '+proj=longlat +datum=NAD83 +no_defs'],
  // UTM Zone 18N (common for NYC LiDAR/aerial data)
  ['EPSG:32618', '+proj=utm +zone=18 +datum=WGS84 +units=m +no_defs'],
  ['EPSG:26918', '+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs'],
  // NY State Plane Long Island (feet) — used by NYC open data
  ['EPSG:2263', '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +datum=NAD83 +units=us-ft +no_defs'],
  // NY State Plane 2011 (feet)
  ['EPSG:6539', '+proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 +lat_0=40.16666666666666 +lon_0=-74 +x_0=300000.0000000001 +y_0=0 +datum=NAD83 +units=us-ft +no_defs'],
])

// Keep canvas small so the Blob stays under ~1MB and loads instantly in Mapbox.
// The mask is a binary overlay — 2048px is more than enough visual detail.
const MAX_CANVAS_DIM = 2048

function toWgs84(epsg: number, x: number, y: number): [number, number] {
  const code = `EPSG:${epsg}`
  try {
    return proj4(code, 'EPSG:4326', [x, y]) as [number, number]
  } catch {
    throw new Error(`Cannot reproject EPSG:${epsg} → WGS84. Add its proj4 definition to useGeoTiffMask.ts`)
  }
}

/**
 * geotiff.js exposes CRS via getGeoKeys(), not a `.geoKeys` property.
 * Some GDAL exports omit ProjectedCSTypeGeoKey but include GTCitationGeoKey;
 * without this we mis-read projected bounding boxes as WGS84 lon/lat.
 */
function inferSourceEpsg(
  geoKeys: Partial<Record<string, unknown>> | null | undefined,
  bbox: readonly [number, number, number, number],
): number {
  const pcs = geoKeys?.ProjectedCSTypeGeoKey
  if (typeof pcs === 'number' && pcs > 0) return pcs

  const geo = geoKeys?.GeographicTypeGeoKey
  if (typeof geo === 'number' && geo > 0) return geo

  const citation = geoKeys?.GTCitationGeoKey
  if (typeof citation === 'string') {
    const c = citation.toLowerCase()
    if (c.includes('new york long island')) {
      if (c.includes('2011')) return 6539
      return 2263
    }
    if (c.includes('utm zone 18n') || (c.includes('utm zone 18') && c.includes('north'))) {
      if (c.includes('nad83')) return 26918
      return 32618
    }
  }

  const maxAbs = Math.max(
    Math.abs(bbox[0]),
    Math.abs(bbox[1]),
    Math.abs(bbox[2]),
    Math.abs(bbox[3]),
  )

  if (maxAbs <= 180) {
    const [w, s, e, n] = bbox
    if (w < e && s < n && w >= -180 && e <= 180 && s >= -90 && n <= 90) return 4326
  }

  // NYC State Plane / similar projected coordinates (feet or metres)
  if (maxAbs > 1e5 && maxAbs < 5e6) return 2263

  return 4326
}

async function renderMask(url: string): Promise<GeoTiffMaskResult> {
  // Use fetch + ArrayBuffer instead of fromUrl to avoid range-request issues
  // with Vite's dev server and simple static hosts
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  const buffer = await res.arrayBuffer()
  const tiff = await fromArrayBuffer(buffer)
  const image = await tiff.getImage()

  const fullWidth = image.getWidth()
  const fullHeight = image.getHeight()

  // Downsample to fit WebGL texture limits while preserving aspect ratio
  const scale = Math.min(1, MAX_CANVAS_DIM / fullWidth, MAX_CANVAS_DIM / fullHeight)
  const renderWidth = Math.max(1, Math.round(fullWidth * scale))
  const renderHeight = Math.max(1, Math.round(fullHeight * scale))

  // Read raster at render resolution (geotiff handles downsampling)
  const rasters = await image.readRasters({
    samples: [0],
    width: renderWidth,
    height: renderHeight,
    resampleMethod: 'nearest',
  })
  const band = rasters[0] as ArrayLike<number>

  // Render binary mask: permeable (1) → chartreuse, impermeable (0) → transparent
  const canvas = document.createElement('canvas')
  canvas.width = renderWidth
  canvas.height = renderHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not get 2D canvas context')

  const imgData = ctx.createImageData(renderWidth, renderHeight)
  for (let i = 0; i < renderWidth * renderHeight; i++) {
    const p = i * 4
    if (band[i] !== 0) {
      imgData.data[p] = 216      // R  (chartreuse #D8CF00)
      imgData.data[p + 1] = 207  // G
      imgData.data[p + 2] = 0    // B
      imgData.data[p + 3] = 170  // A  (~67% opacity)
    }
    // impermeable pixels stay transparent (alpha = 0)
  }
  ctx.putImageData(imgData, 0, 0)

  // Use a Blob URL instead of a data URL — data URLs for large canvases can
  // exceed browser limits and cause Mapbox's image loader to fail silently.
  const imageUrl = await new Promise<string>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob))
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })

  // Determine WGS84 bounding box
  const bbox = image.getBoundingBox() as [number, number, number, number]
  const geoKeys = image.getGeoKeys()
  const epsg = inferSourceEpsg(geoKeys, bbox)

  let west: number, south: number, east: number, north: number
  if (epsg === 4326 || epsg === 4269) {
    ;[west, south, east, north] = bbox
  } else {
    ;[west, south] = toWgs84(epsg, bbox[0], bbox[1])
    ;[east, north] = toWgs84(epsg, bbox[2], bbox[3])
  }

  return {
    imageUrl,
    coordinates: [
      [west, north],  // top-left
      [east, north],  // top-right
      [east, south],  // bottom-right
      [west, south],  // bottom-left
    ],
  }
}

interface UseGeoTiffMaskState {
  result: GeoTiffMaskResult | null
  loading: boolean
  error: string | null
}

export function useGeoTiffMask(url: string): UseGeoTiffMaskState {
  const blobRef = useRef<string | null>(null)
  const [state, setState] = useState<UseGeoTiffMaskState>({
    result: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState({ result: null, loading: true, error: null })

    renderMask(url)
      .then((result) => {
        if (cancelled) {
          if (result.imageUrl.startsWith('blob:')) URL.revokeObjectURL(result.imageUrl)
          return
        }
        blobRef.current = result.imageUrl
        setState({ result, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          console.error('[useGeoTiffMask]', msg)
          setState({ result: null, loading: false, error: msg })
        }
      })

    return () => {
      cancelled = true
      const stale = blobRef.current
      if (stale?.startsWith('blob:')) URL.revokeObjectURL(stale)
      blobRef.current = null
    }
  }, [url])

  return state
}
