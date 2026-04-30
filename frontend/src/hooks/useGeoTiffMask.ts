import { useEffect, useState } from 'react'
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

const MAX_CANVAS_DIM = 4096

function toWgs84(epsg: number, x: number, y: number): [number, number] {
  const code = `EPSG:${epsg}`
  try {
    return proj4(code, 'EPSG:4326', [x, y]) as [number, number]
  } catch {
    throw new Error(`Cannot reproject EPSG:${epsg} → WGS84. Add its proj4 definition to useGeoTiffMask.ts`)
  }
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
  const imageUrl = canvas.toDataURL('image/png')

  // Determine WGS84 bounding box
  const bbox = image.getBoundingBox() // [west, south, east, north] in native CRS
  // geoKeys is not in geotiff's public TypeScript interface but is present at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const geoKeys = (image as any).geoKeys as Record<string, number> | undefined
  const projEpsg = geoKeys?.ProjectedCSTypeGeoKey
  const geoEpsg = geoKeys?.GeographicTypeGeoKey
  const epsg = projEpsg ?? geoEpsg ?? 4326

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
        if (!cancelled) setState({ result, loading: false, error: null })
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
    }
  }, [url])

  return state
}
