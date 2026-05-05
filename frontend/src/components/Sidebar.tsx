import { createElement } from 'react'
import { CloudRain, Layers, Leaf, LocateFixed, Mountain } from 'lucide-react'
import type { LayerVisibility } from '../types'
import { FLOOD_SCENARIOS, RAIN_INCH_MAX, RAIN_INCH_MIN, RAIN_SLIDER_MIN } from '../constants'

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
  layers: LayerVisibility
  onLayersChange: (v: LayerVisibility) => void
  onFlyToLidar: () => void
}

export default function Sidebar({
  rainfallInches,
  onRainfallChange,
  layers,
  onLayersChange,
  onFlyToLidar,
}: SidebarProps) {
  const scenario = rainfallInches >= RAIN_INCH_MIN
    ? FLOOD_SCENARIOS[rainfallInches as keyof typeof FLOOD_SCENARIOS]
    : null

  return (
    <aside className="pointer-events-auto fixed top-3 left-3 z-20 w-[min(calc(100vw-1.5rem),22rem)] max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl border border-khaki/30 bg-zinc-950/72 p-4 font-sans shadow-2xl backdrop-blur-xl sm:top-4 sm:left-4">
      <div className="mb-4 px-1">
        <h1 className="font-semibold text-lg text-honey-quartz tracking-tight">
          NYC Digital Twin
        </h1>
        <p className="mt-0.5 text-xs leading-relaxed text-stone-400">
          Flood modeling · permeability · LiDAR terrain
        </p>
      </div>

      {/* ── Flood Simulator ─────────────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <CloudRain className="size-4 text-sky-400" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wide text-stone-100 uppercase">
            Flood Simulator
          </h2>
        </div>
        <div className="rounded-xl border border-sky-500/25 bg-zinc-900/50 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-stone-400">Rainfall intensity</span>
            {scenario ? (
              <span className="rounded-md bg-sky-900/60 px-2 py-0.5 font-semibold text-sky-300 ring-1 ring-sky-500/40">
                {scenario.label} · {scenario.subtitle}
              </span>
            ) : (
              <span className="text-stone-500">Off</span>
            )}
          </div>

          <input
            type="range"
            min={RAIN_SLIDER_MIN}
            max={RAIN_INCH_MAX}
            step={1}
            value={rainfallInches}
            onChange={(e) => onRainfallChange(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-700 accent-sky-400"
            aria-valuemin={RAIN_SLIDER_MIN}
            aria-valuemax={RAIN_INCH_MAX}
            aria-valuenow={rainfallInches}
            aria-label="Flood scenario intensity"
          />

          <div className="mt-1.5 flex justify-between text-[9px] text-stone-500">
            <span>Off</span>
            <span>1 in</span>
            <span>3 in</span>
            <span>Extreme</span>
          </div>

          {scenario && (
            <p className="mt-2 text-[10px] leading-normal text-stone-400">
              {scenario.description}
            </p>
          )}
        </div>
      </section>

      {/* ── Layers ──────────────────────────────────────────────────────── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2">
          <Layers className="size-4 text-khaki" aria-hidden />
          <h2 className="text-xs font-semibold tracking-wide text-stone-100 uppercase">
            Layers
          </h2>
        </div>
        <div className="flex flex-col gap-2">
          <ToggleRow
            id="layer-terrain"
            icon={Mountain}
            label="Elevation — hillshade · contours · LiDAR curbs"
            checked={layers.topographicRelief}
            onChange={(v) => onLayersChange({ ...layers, topographicRelief: v })}
          />
          <ToggleRow
            id="layer-perm"
            icon={Leaf}
            label="Permeability mask (NDVI vegetation)"
            checked={layers.permeabilityNdvi}
            onChange={(v) => onLayersChange({ ...layers, permeabilityNdvi: v })}
          />
          <ToggleRow
            id="layer-catch"
            icon={Layers}
            label="Catch basins"
            checked={layers.catchBasins}
            onChange={(v) => onLayersChange({ ...layers, catchBasins: v })}
          />
        </div>
      </section>

      {/* ── High-res LiDAR data location note ───────────────────────────── */}
      <section>
        <div className="rounded-xl border border-indigo-500/25 bg-zinc-900/50 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold text-indigo-300">
                High-res LiDAR contours
              </p>
              <p className="mt-0.5 text-[9px] leading-snug text-stone-500">
                0.5 m interval · NJ Palisades · zoom 16
              </p>
              <p className="mt-0.5 text-[9px] tabular-nums text-stone-600">
                40.856°N, -74.018°W
              </p>
            </div>
            <button
              type="button"
              onClick={onFlyToLidar}
              className="mt-0.5 flex shrink-0 items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-950/60 px-2 py-1 text-[10px] font-medium text-indigo-300 transition hover:border-indigo-400/60 hover:bg-indigo-900/60"
              aria-label="Fly to high-res LiDAR contour area"
            >
              <LocateFixed className="size-3" aria-hidden />
              Locate
            </button>
          </div>
        </div>
      </section>
    </aside>
  )
}
