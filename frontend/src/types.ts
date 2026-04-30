export interface LayerVisibility {
  permeabilityNdvi: boolean
  curbLidar: boolean
  catchBasins: boolean
}

/** Rendered GeoTIFF mask ready for a Mapbox image source */
export interface GeoTiffMaskResult {
  /** base64 data URL of the coloured PNG */
  imageUrl: string
  /** WGS84 corners: top-left, top-right, bottom-right, bottom-left as [lng, lat] */
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number],
  ]
}
