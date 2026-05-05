export interface LayerVisibility {
  /** Permeability mask — Mapbox raster tileset `keethu-j.perm_mask_nyc` (NDVI binary mask). */
  permeabilityNdvi: boolean
  /**
   * All elevation layers toggled together: hillshade, terrain-v2 contours, LiDAR curbs,
   * 1m/2m flood boundary lines, 0.5m LiDAR contours (NJ Palisades DEM).
   */
  topographicRelief: boolean
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
