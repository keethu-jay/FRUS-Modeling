import { useCallback, useRef, useState } from 'react'
import { RAIN_INCH_MIN } from './constants'
import FloodScenarioLegend from './components/FloodScenarioLegend'
import TerrainHillshadeLegend from './components/TerrainHillshadeLegend'
import MapContainer from './components/MapContainer'
import Sidebar from './components/Sidebar'
import type { LayerVisibility } from './types'

export default function App() {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''

  const [rainfallInches, setRainfallInches] = useState(0)
  const [layers, setLayers] = useState<LayerVisibility>({
    permeabilityNdvi: true,
    topographicRelief: true,
    catchBasins: false,
  })

  const onLayersChange = useCallback((next: LayerVisibility) => setLayers(next), [])

  // Callback ref populated by MapContainer so sibling components can trigger flyTo
  const flyToLidarRef = useRef<(() => void) | null>(null)
  const onFlyToLidar = useCallback(() => flyToLidarRef.current?.(), [])

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950 font-sans">
      <MapContainer
        accessToken={accessToken}
        rainfallInches={rainfallInches}
        layers={layers}
        flyToLidarRef={flyToLidarRef}
      />
      <Sidebar
        rainfallInches={rainfallInches}
        onRainfallChange={setRainfallInches}
        layers={layers}
        onLayersChange={onLayersChange}
        onFlyToLidar={onFlyToLidar}
      />
      <FloodScenarioLegend rainfallInches={rainfallInches} />
      <TerrainHillshadeLegend
        visible={layers.topographicRelief}
        liftForFloodLegend={rainfallInches >= RAIN_INCH_MIN}
      />
      {accessToken && (
        <footer className="pointer-events-none fixed bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-khaki/30 bg-zinc-950/90 px-3 py-1 text-[10px] text-stone-300/90 backdrop-blur-md sm:block">
          Mapbox · {rainfallInches < RAIN_INCH_MIN ? 'flood off' : `scenario ${rainfallInches}`}
        </footer>
      )}
    </div>
  )
}
