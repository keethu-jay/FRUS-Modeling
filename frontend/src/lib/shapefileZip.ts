import { parseZip } from 'shpjs'

type FeatureCollectionLike = {
  type: 'FeatureCollection'
  features: Array<{ type: 'Feature'; geometry?: unknown; properties?: Record<string, unknown> }>
}

function isFeatureCollection(x: unknown): x is FeatureCollectionLike {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as FeatureCollectionLike).type === 'FeatureCollection' &&
    Array.isArray((x as FeatureCollectionLike).features)
  )
}

/** `parseZip` returns one FC or an array when multiple shapefiles exist in the archive. */
export function mergeZipFeatureCollections(
  parsed: FeatureCollectionLike | FeatureCollectionLike[],
): FeatureCollectionLike {
  if (!Array.isArray(parsed)) return parsed
  const features = parsed.flatMap((fc) => (isFeatureCollection(fc) ? fc.features : []))
  return { type: 'FeatureCollection', features }
}

export type LoadShapefileOptions = {
  /** Skip fetch/parse when the zip exceeds this size (bytes); avoids browser OOM on huge citywide extracts. */
  maxZipBytes?: number
}

/** Stream GET body and abort before buffering more than `maxBytes` (when Content-Length is missing). */
async function fetchArrayBufferUnderLimit(
  url: string,
  maxBytes: number,
): Promise<ArrayBuffer | null> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)

  const cl = res.headers.get('content-length')
  if (cl) {
    const n = parseInt(cl, 10)
    if (!Number.isNaN(n) && n > maxBytes) {
      console.warn(
        `[shapefile] ${url}: ${(n / (1024 * 1024)).toFixed(1)} MB zip exceeds max ${(maxBytes / (1024 * 1024)).toFixed(0)} MB — skipping in-browser load (use a clipped shapefile or vector tiles).`,
      )
      return null
    }
  }

  if (!res.body) {
    const buf = await res.arrayBuffer()
    if (buf.byteLength > maxBytes) {
      console.warn(
        `[shapefile] ${url}: ${(buf.byteLength / (1024 * 1024)).toFixed(1)} MB exceeds max ${(maxBytes / (1024 * 1024)).toFixed(0)} MB — skipping parse.`,
      )
      return null
    }
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value?.length) continue
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      console.warn(
        `[shapefile] ${url}: download exceeded ${(maxBytes / (1024 * 1024)).toFixed(0)} MB — aborted (use a clipped shapefile or vector tiles).`,
      )
      return null
    }
    chunks.push(value)
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    merged.set(c, offset)
    offset += c.byteLength
  }
  return merged.buffer
}

/** Fetch a `.zip` shapefile bundle and return GeoJSON (WGS84 when `.prj` is present). */
export async function loadShapefileZipAsGeoJson(
  url: string,
  options?: LoadShapefileOptions,
): Promise<FeatureCollectionLike | null> {
  const maxZipBytes = options?.maxZipBytes

  if (maxZipBytes != null) {
    const buf = await fetchArrayBufferUnderLimit(url, maxZipBytes)
    if (!buf) return null
    const parsed = await parseZip(buf)
    return mergeZipFeatureCollections(parsed as FeatureCollectionLike | FeatureCollectionLike[])
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const parsed = await parseZip(buf)
  return mergeZipFeatureCollections(parsed as FeatureCollectionLike | FeatureCollectionLike[])
}

export function lineStringFeaturesOnly(fc: FeatureCollectionLike): FeatureCollectionLike {
  return {
    type: 'FeatureCollection',
    features: fc.features.filter(
      (f) =>
        f.geometry &&
        typeof f.geometry === 'object' &&
        'type' in (f.geometry as object) &&
        ((f.geometry as { type: string }).type === 'LineString' ||
          (f.geometry as { type: string }).type === 'MultiLineString'),
    ),
  }
}
