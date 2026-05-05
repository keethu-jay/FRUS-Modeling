export interface LayerVisibility {
  /** Permeability mask from `mask_vector.zip` (shapefile bundle in `public/`; path override `VITE_MASK_VECTOR_ZIP`). */
  permeabilityNdvi: boolean
  /**
   * Topography: Mapbox vector tilesets (`eco_topo_nyc_p01` … plus p16 splits), optional LiDAR curb GeoJSON
   * (`VITE_CURBS_GEOJSON`), toggled together.
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
