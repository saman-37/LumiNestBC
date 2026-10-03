export const TAGLINE = 'Find the lights still on.'

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-full bg-light-soft shadow-[0_0_12px_#ffd27a]" />
        <span className="text-xl font-extrabold tracking-tight text-ink">
          Luminest<span className="text-light">BC</span>
        </span>
      </div>
      {!compact && <p className="mt-0.5 text-sm text-muted">{TAGLINE}</p>}
    </div>
  )
}

export function DemoBadge() {
  return (
    <span className="shrink-0 rounded-full border border-line bg-surface/80 px-2.5 py-1 text-xs font-medium text-muted">
      Demo data
    </span>
  )
}
