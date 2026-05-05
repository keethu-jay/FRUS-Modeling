interface TerrainHillshadeLegendProps {
  visible: boolean
  liftForFloodLegend?: boolean
}

// Elevation stops matching the hillshade + contour color ramp used in MapContainer.
// Values are metres above sea level.
const ELEV_STOPS = [
  { elev: '0 m',  color: '#e9d5ff' },
  { elev: '10 m', color: '#c084fc' },
  { elev: '25 m', color: '#a855f7' },
  { elev: '45 m', color: '#7c3aed' },
  { elev: '65 m', color: '#4c1d95' },
]

export default function TerrainHillshadeLegend({
  visible,
  liftForFloodLegend = false,
}: TerrainHillshadeLegendProps) {
  if (!visible) return null

  const gradient = `linear-gradient(to top, ${ELEV_STOPS.map(s => s.color).join(', ')})`

  return (
    <div
      className={[
        'pointer-events-none fixed right-3 z-10 w-[min(100vw-1.5rem,15rem)] rounded-xl border border-violet-500/35 bg-zinc-950/85 px-3 py-2.5 font-sans shadow-2xl backdrop-blur-xl sm:right-4',
        liftForFloodLegend ? 'bottom-32 sm:bottom-36' : 'bottom-3 sm:bottom-4',
      ].join(' ')}
      role="img"
      aria-label="Elevation legend"
    >
      <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-violet-200/90 uppercase">
        Elevation
      </p>

      {/* Gradient bar + tick labels */}
      <div className="flex items-stretch gap-2">
        <div
          className="w-3 shrink-0 rounded"
          style={{ background: gradient }}
        />
        <div className="flex flex-col justify-between py-0.5">
          {[...ELEV_STOPS].reverse().map(({ elev, color }) => (
            <div key={elev} className="flex items-center gap-1.5">
              <span className="text-[10px] tabular-nums" style={{ color }}>
                {elev}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Permeability mask entry */}
      <div className="mt-2.5 flex items-center gap-2 border-t border-white/10 pt-2">
        <div
          className="h-3 w-3 shrink-0 rounded"
          style={{ background: '#00e676', opacity: 0.65 }}
        />
        <span className="text-[10px] text-emerald-300">
          Permeable surface (NDVI)
        </span>
      </div>

      {/* Flood fill entry */}
      <div className="mt-1.5 flex items-center gap-2">
        <div
          className="h-3 w-3 shrink-0 rounded"
          style={{ background: '#007cbf', opacity: 0.62 }}
        />
        <span className="text-[10px] text-sky-300">
          Flood inundation zone
        </span>
      </div>
    </div>
  )
}
