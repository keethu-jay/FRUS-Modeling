import { createElement } from 'react'
import {
  CloudRain,
  Layers,
  MapPin,
  Mountain,
  Pause,
  Play,
  Waves,
} from 'lucide-react'
import type { LayerVisibility } from '../types'
import {
  RAIN_INCH_MAX,
  RAIN_INCH_MIN,
  TIME_STEP_MAX_FLOOD,
  TIME_STEP_MIN,
  TIMESTEP_MINUTES,
} from '../constants'

interface ToggleRowProps {
  id: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}

function ToggleRow({ id, icon, label, checked, onChange }: ToggleRowProps) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/55 px-3 py-2 transition hover:border-honey-quartz/35 hover:bg-zinc-800/70"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-3.5 rounded border-khaki/60 bg-zinc-950 accent-honey-quartz focus:ring-2 focus:ring-honey-quartz/50 focus:ring-offset-1 focus:ring-offset-zinc-950"
      />
      {createElement(icon, {
        className: 'size-4 shrink-0 text-honey-quartz',
        'aria-hidden': true,
      })}
      <span className="text-[13px] leading-snug text-stone-100">{label}</span>
    </label>
  )
}

interface SidebarProps {
  rainfallInches: number
  onRainfallChange: (v: number) => void
  timeStep: number
  onTimeStepChange: (v: number) => void
  playing: boolean
  onPlayingChange: (v: boolean) => void
  layers: LayerVisibility
  onLayersChange: (v: LayerVisibility) => void
}

export default function Sidebar({
  rainfallInches,
  onRainfallChange,
  timeStep,
  onTimeStepChange,
  playing,
  onPlayingChange,
  layers,
  onLayersChange,
}: SidebarProps) {
  const currentMinutes = TIMESTEP_MINUTES[timeStep] ?? 0

  return (
    <aside className="pointer-events-auto fixed top-3 left-3 z-20 w-[min(calc(100vw-1.5rem),22rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-khaki/30 bg-zinc-950/72 p-4 font-sans shadow-2xl backdrop-blur-xl sm:top-4 sm:left-4">
      <div className="mb-4 rounded-xl border border-khaki/25 bg-army/50 px-3 py-3">
        <p className="text-[10px] font-semibold tracking-[0.2em] text-chartreuse uppercase">
          Geospatial portfolio
        </p>
        <h1 className="mt-1 font-semibold text-lg text-honey-quartz tracking-tight">
          Eco-Sentry NYC
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-300">
          Urban flood modeling — NDVI permeability + LiDAR DEM + 2D SWE solver.
        </p>
      </div>

      {/* ── Rainfall ────────────────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-stone-200">
          <CloudRain className="size-4 text-honey-quartz" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wide text-stone-100 uppercase">
            Rainfall intensity
          </h2>
        </div>
        <div className="rounded-xl border border-khaki/25 bg-army/50 px-3 py-3">
          <div className="mb-2 flex justify-between text-[11px] tabular-nums text-stone-400">
            <span>{RAIN_INCH_MIN} in</span>
            <span className="font-semibold text-honey-quartz">
              {rainfallInches} in
            </span>
            <span>{RAIN_INCH_MAX} in</span>
          </div>
          <input
            type="range"
            min={RAIN_INCH_MIN}
            max={RAIN_INCH_MAX}
            step={1}
            value={rainfallInches}
            onChange={(e) => onRainfallChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-army accent-honey-quartz"
            aria-valuemin={RAIN_INCH_MIN}
            aria-valuemax={RAIN_INCH_MAX}
            aria-valuenow={rainfallInches}
            aria-label="Rainfall intensity in inches"
          />
          <p className="mt-2 text-[10px] leading-normal text-stone-400">
            Tile path:{' '}
            <code className="rounded bg-army px-1 text-chartreuse/95">
              /data/flood/{rainfallInches}in_{currentMinutes}min/…
            </code>
          </p>
        </div>
      </section>

      {/* ── Time-step playback ──────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-stone-200">
          <Waves className="size-4 text-chartreuse" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wide text-stone-100 uppercase">
            Time-step playback
          </h2>
        </div>
        <div className="rounded-xl border border-khaki/25 bg-army/50 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] tabular-nums text-stone-400">
              T+{currentMinutes} min / 60 min
            </span>
            <button
              type="button"
              onClick={() => onPlayingChange(!playing)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-persimmon/25 px-2.5 py-1.5 text-[11px] font-semibold text-stone-100 ring-1 ring-persimmon/55 transition hover:bg-persimmon/40"
            >
              {playing ? (
                <>
                  <Pause className="size-3.5 text-honey-quartz" aria-hidden /> Pause
                </>
              ) : (
                <>
                  <Play className="size-3.5 text-honey-quartz" aria-hidden /> Play
                </>
              )}
            </button>
          </div>
          <input
            type="range"
            min={TIME_STEP_MIN}
            max={TIME_STEP_MAX_FLOOD}
            step={1}
            value={timeStep}
            onChange={(e) => onTimeStepChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-army accent-chartreuse"
            aria-label="Flood propagation time step"
          />
          <div className="mt-1.5 flex justify-between text-[9px] tabular-nums text-stone-500">
            {TIMESTEP_MINUTES.map((m) => (
              <span key={m}>{m}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Layer toggles ────────────────────────────────────────────── */}
      <section>
        <div className="mb-2 flex items-center gap-2 text-stone-200">
          <Layers className="size-4 text-khaki" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wide text-stone-100 uppercase">
            Layer toggles
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          <ToggleRow
            id="layer-ndvi"
            icon={Mountain}
            label="Permeability mask (NDVI)"
            checked={layers.permeabilityNdvi}
            onChange={(v) => onLayersChange({ ...layers, permeabilityNdvi: v })}
          />
          <ToggleRow
            id="layer-curb"
            icon={MapPin}
            label="Curb geometry (LiDAR) — zoom 13+ (auto-zoom)"
            checked={layers.curbLidar}
            onChange={(v) => onLayersChange({ ...layers, curbLidar: v })}
          />
          <ToggleRow
            id="layer-catch"
            icon={Layers}
            label="Catch basin sinks"
            checked={layers.catchBasins}
            onChange={(v) => onLayersChange({ ...layers, catchBasins: v })}
          />
        </div>
      </section>
    </aside>
  )
}
