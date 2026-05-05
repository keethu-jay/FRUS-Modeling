interface TerrainHillshadeLegendProps {
  visible: boolean
  liftForDepthLegend?: boolean
}

export default function TerrainHillshadeLegend({
  visible,
  liftForDepthLegend = false,
}: TerrainHillshadeLegendProps) {
  if (!visible) return null

  return (
    <div
      className={[
        'pointer-events-none fixed right-3 z-10 w-[min(100vw-1.5rem,17.5rem)] rounded-xl border border-violet-500/35 bg-zinc-950/82 px-3 py-2.5 font-sans shadow-2xl backdrop-blur-xl sm:right-4',
        liftForDepthLegend ? 'bottom-32 sm:bottom-36' : 'bottom-3 sm:bottom-4',
      ].join(' ')}
      role="img"
      aria-label="Legend: Mapbox vector topography tilesets and permeability shapefile"
    >
      <p className="mb-1 text-[10px] font-semibold tracking-[0.12em] text-violet-200/95 uppercase">
        Vector overlays
      </p>
      <p className="mb-1.5 text-[9px] leading-snug text-stone-300">
        <strong className="font-medium text-violet-200/90">Topography</strong> is{' '}
        <code className="rounded bg-zinc-900/90 px-1 text-[8px] text-chartreuse/90">eco_topo_nyc_*</code>{' '}
        Mapbox vector tilesets (purple fill and lines), merged visually from split uploads.
      </p>
      <p className="border-t border-white/10 pt-1.5 text-[9px] leading-snug text-stone-400">
        <strong className="font-medium text-emerald-200/85">Permeability</strong> comes from{' '}
        <code className="rounded bg-zinc-900/90 px-1 text-[8px] text-chartreuse/90">mask_vector.zip</code>{' '}
        (semi-transparent green fill and lines).
      </p>
    </div>
  )
}
