import { FLOOD_SCENARIOS, RAIN_INCH_MIN } from '../constants'

interface FloodScenarioLegendProps {
  rainfallInches: number
}

export default function FloodScenarioLegend({ rainfallInches }: FloodScenarioLegendProps) {
  if (rainfallInches < RAIN_INCH_MIN) return null

  const scenario = FLOOD_SCENARIOS[rainfallInches as keyof typeof FLOOD_SCENARIOS]
  if (!scenario) return null

  const depth = rainfallInches === 1 ? '0.1 – 0.4 m' : rainfallInches === 2 ? '0.3 – 1.2 m' : '0.6 – 2.5 m'

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-10 w-[min(100vw-1.5rem,17rem)] rounded-xl border border-sky-500/40 bg-zinc-950/88 px-3 py-2.5 font-sans shadow-2xl backdrop-blur-xl sm:right-4 sm:bottom-4"
      role="img"
      aria-label={`Flood scenario: ${scenario.label}`}
    >
      <p className="mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-sky-300 uppercase">
        Flood Vulnerability Simulator
      </p>

      {/* Color swatch row */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className="h-3 w-10 shrink-0 rounded ring-1 ring-sky-400/40"
          style={{ background: 'linear-gradient(to right, #007cbf 0%, #004a8f 100%)' }}
        />
        <span className="text-[11px] font-semibold text-sky-200">{scenario.label}</span>
        <span className="ml-auto text-[10px] tabular-nums text-stone-400">{scenario.subtitle}</span>
      </div>

      <p className="mb-1.5 text-[10px] leading-snug text-stone-400">{scenario.description}</p>

      {/* Depth scale */}
      <div className="border-t border-white/10 pt-1.5">
        <div
          className="mb-0.5 h-2.5 w-full rounded ring-1 ring-sky-600/30"
          style={{ background: 'linear-gradient(to right, #cce8ff, #007cbf, #004a8f)' }}
        />
        <div className="flex justify-between text-[9px] tabular-nums text-stone-500">
          <span>Shallow</span>
          <span className="text-stone-400">{depth}</span>
          <span>Deep</span>
        </div>
      </div>
    </div>
  )
}
