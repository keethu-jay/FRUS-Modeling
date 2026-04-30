import { useCallback, useEffect, useState } from 'react'
import { RAIN_INCH_MIN, TIME_STEP_MAX_FLOOD, TIME_STEP_MIN } from './constants'
import DepthLegend from './components/DepthLegend'
import MapContainer from './components/MapContainer'
import Sidebar from './components/Sidebar'
import type { LayerVisibility } from './types'

const TICK_MS = 650

export default function App() {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''

  const [rainfallInches, setRainfallInches] = useState(0)
  const [timeStep, setTimeStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>({
    permeabilityNdvi: false,
    curbLidar: false,
    catchBasins: false,
  })

  const onLayersChange = useCallback((next: LayerVisibility) => {
    setLayers(next)
  }, [])

  useEffect(() => {
    if (!playing) return undefined
    const id = window.setInterval(() => {
      setTimeStep((t) => (t >= TIME_STEP_MAX_FLOOD ? TIME_STEP_MIN : t + 1))
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing])

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950 font-sans">
      <MapContainer
        accessToken={accessToken}
        rainfallInches={rainfallInches}
        timeStep={timeStep}
        layers={layers}
      />
      <Sidebar
        rainfallInches={rainfallInches}
        onRainfallChange={setRainfallInches}
        timeStep={timeStep}
        onTimeStepChange={(t) => setTimeStep(t)}
        playing={playing}
        onPlayingChange={setPlaying}
        layers={layers}
        onLayersChange={onLayersChange}
      />
      <DepthLegend visible={rainfallInches >= RAIN_INCH_MIN} />
      {accessToken && (
        <footer className="pointer-events-none fixed bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-khaki/30 bg-zinc-950/90 px-3 py-1 text-[10px] text-stone-300/90 backdrop-blur-md sm:block">
          Mapbox · rainfall{' '}
          {rainfallInches < RAIN_INCH_MIN ? 'off' : `${rainfallInches} in`} · frame {timeStep}
        </footer>
      )}
    </div>
  )
}
