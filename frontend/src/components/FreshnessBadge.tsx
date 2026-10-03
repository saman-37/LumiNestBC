import { formatAgo } from '../lib/format'
import type { Freshness } from '../lib/types'

// Colour is backed by a word, so meaning never relies on colour alone.
const META: Record<Freshness, { label: string; dot: string }> = {
  green: { label: 'Fresh', dot: 'bg-fresh' },
  amber: { label: 'Check', dot: 'bg-aging' },
  red: { label: 'Stale', dot: 'bg-stale' },
}

export function FreshnessBadge({ freshness, minutes }: { freshness: Freshness; minutes: number }) {
  const { label, dot } = META[freshness]
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 text-sm">
      <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-semibold text-ink">{label}</span>
      <span className="text-muted">· updated {formatAgo(minutes)}</span>
    </span>
  )
}
