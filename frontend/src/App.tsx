import { useCallback, useEffect, useState } from 'react'
import { RAIN_INCH_MIN, TIME_STEP_MAX_FLOOD, TIME_STEP_MIN } from './constants'
import DepthLegend from './components/DepthLegend'
import MapContainer from './components/MapContainer'
import PermeabilityMaskMap from './components/PermeabilityMaskMap'
import Sidebar from './components/Sidebar'
import type { LayerVisibility } from './types'

const TICK_MS = 650
type View = 'flood-sim' | 'permeability'

export default function App() {
  const accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''

  const [view, setView] = useState<View>('flood-sim')
  const [rainfallInches, setRainfallInches] = useState(RAIN_INCH_MIN + 1)
  const [timeStep, setTimeStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>({
    permeabilityNdvi: true,
    curbLidar: false,
    catchBasins: true,
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
      {/* View switcher tab bar */}
      <div className="pointer-events-auto absolute top-3 left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-full border border-white/10 bg-zinc-950/90 p-1 backdrop-blur-md shadow-lg">
        {([
          { id: 'flood-sim',    label: 'Flood Sim' },
          { id: 'permeability', label: 'Permeability Mask' },
        ] as { id: View; label: string }[]).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            className={[
              'rounded-full px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-all duration-150',
              view === tab.id
                ? 'bg-emerald-600/30 text-emerald-300 ring-1 ring-emerald-500/50'
                : 'text-stone-500 hover:text-stone-300',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Both views are absolutely positioned so each map always has full
          dimensions — visibility:hidden (Tailwind "invisible") preserves layout
          so Mapbox can read correct container size on init. */}

      {/* Flood simulation view */}
      <div className={`absolute inset-0 transition-opacity duration-200 ${view === 'flood-sim' ? 'z-10' : 'invisible pointer-events-none'}`}>
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
        <DepthLegend />
        {accessToken && (
          <footer className="pointer-events-none fixed bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-khaki/30 bg-zinc-950/90 px-3 py-1 text-[10px] text-stone-300/90 backdrop-blur-md sm:block">
            Mapbox · rainfall {rainfallInches} in · frame {timeStep}
          </footer>
        )}
      </div>

      {/* Permeability mask tileset view */}
      <div className={`absolute inset-0 transition-opacity duration-200 ${view === 'permeability' ? 'z-10' : 'invisible pointer-events-none'}`}>
        <PermeabilityMaskMap accessToken={accessToken} />
      </div>
    </div>
  )
}
