/** Depth ramp using Eco-Sentry palette (Chartreuse → Honey → Persimmon → Khaki → Army). */
const STOPS = [
  { x: '0%', color: '#D8CF00' },
  { x: '20%', color: '#E8C818' },
  { x: '40%', color: '#F7B720' },
  { x: '60%', color: '#F35900' },
  { x: '80%', color: '#6D7636' },
  { x: '100%', color: '#42421E' },
]

const gradient = `linear-gradient(to right, ${STOPS.map((s) => `${s.color} ${s.x}`).join(', ')})`

interface DepthLegendProps {
  visible: boolean
}

export default function DepthLegend({ visible }: DepthLegendProps) {
  if (!visible) return null

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-3 z-10 w-[min(100vw-1.5rem,17rem)] rounded-xl border border-khaki/40 bg-army/75 px-3 py-2.5 font-sans shadow-2xl backdrop-blur-xl sm:right-4 sm:bottom-4"
      role="img"
      aria-label="Legend: simulated water depth from 0 to 2 meters"
    >
      <p className="mb-2 text-[10px] font-semibold tracking-[0.12em] text-chartreuse uppercase">
        Water depth (sim.)
      </p>
      <div
        className="mb-1 h-3 w-full rounded-md ring-1 ring-honey-quartz/35"
        style={{ background: gradient }}
      />
      <div className="flex justify-between text-[10px] tabular-nums text-stone-200">
        <span>0 m</span>
        <span>0.5</span>
        <span>1</span>
        <span>1.5</span>
        <span>2 m</span>
      </div>
    </div>
  )
}
