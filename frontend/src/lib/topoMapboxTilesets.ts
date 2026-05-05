/**
 * Mapbox vector tilesets for NYC topography (split uploads).
 *
 * **Source-layer id:** For Uploads API tilesets, Mapbox uses the upload `--name`
 * as the vector tile `source-layer` id (verified via TileJSON `vector_layers[].id`),
 * not the shapefile basename.
 */

export type TopoTilesetSpec = {
  /** Stable key for layer ids, e.g. p01, p16d03 */
  key: string
  /** Full tileset id `username.name` (no mapbox://) */
  tilesetId: string
  /** Vector tile source-layer name (= upload display name from npm upload:tileset `--name`) */
  sourceLayer: string
}

/** Must match `upload-topo-chunks*.ps1` / `upload-part16-subchunks.ps1` `--name` strings. */
const TOPO_PART_COUNT = 16

/** Matches PS `--name "Eco-Sentry NYC topo p$idx of …"` (literal `p` before index). */
function topoUploadNameSegment(partIndex: number): string {
  if (partIndex === 1) return 'p01'
  return `p${partIndex}`
}

function topoSpecsForAccount(username: string): TopoTilesetSpec[] {
  const out: TopoTilesetSpec[] = []

  for (let i = 1; i <= 15; i++) {
    const p = String(i).padStart(2, '0')
    out.push({
      key: `p${p}`,
      tilesetId: `${username}.eco_topo_nyc_p${p}`,
      sourceLayer: `Eco-Sentry NYC topo ${topoUploadNameSegment(i)} of ${TOPO_PART_COUNT}`,
    })
  }

  const p16abcLayer = 'Eco-Sentry NYC topo p16 sub'
  for (const key of ['p16a', 'p16b', 'p16c'] as const) {
    out.push({
      key,
      tilesetId: `${username}.eco_topo_nyc_${key}`,
      sourceLayer: p16abcLayer,
    })
  }

  for (let i = 1; i <= 8; i++) {
    const d = String(i).padStart(2, '0')
    out.push({
      key: `p16d${d}`,
      tilesetId: `${username}.eco_topo_nyc_p16d${d}`,
      sourceLayer: `Eco-Sentry NYC topo p16 d${i}`,
    })
  }

  return out
}

/** Mapbox username (tileset owner); defaults to keethu-j. */
export function mapboxTopoUsername(): string {
  const raw = import.meta.env.VITE_MAPBOX_TOPO_USERNAME as string | undefined
  const u = raw?.trim()
  return u || 'keethu-j'
}

export function topoTilesetSpecs(): readonly TopoTilesetSpec[] {
  return topoSpecsForAccount(mapboxTopoUsername())
}

export function topoVectorSourceId(key: string): string {
  return `eco-topo-${key}`
}

export function topoFillLayerId(key: string): string {
  return `eco-topo-${key}-fill`
}

export function topoLineLayerId(key: string): string {
  return `eco-topo-${key}-line`
}

export function allTopoVectorLayerIds(specs: readonly TopoTilesetSpec[]): string[] {
  const ids: string[] = []
  for (const s of specs) {
    ids.push(topoFillLayerId(s.key), topoLineLayerId(s.key))
  }
  return ids
}
