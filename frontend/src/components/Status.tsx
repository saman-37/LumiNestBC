import { FILTERS } from '../lib/filters'
import { formatAgo } from '../lib/format'
import type { Freshness, Shelter } from '../lib/types'

// Colour is always paired with words, never used alone.

const FRESH: Record<Freshness, { dot: string; text: string }> = {
  green: { dot: 'bg-green', text: 'text-green-text' },
  amber: { dot: 'bg-amber', text: 'text-amber-text' },
  red: { dot: 'bg-red', text: 'text-red-text' },
}

/**
 * "Updated 4 h ago · Tap Board" with a dot, green / amber / red by freshness. The only freshness
 * indicator in any view: no separate pill, no "may be outdated".
 */
export function FreshnessLine({ shelter, source }: { shelter: Shelter; source?: string | null }) {
  const f = FRESH[shelter.freshness]
  const parts = [`Updated ${formatAgo(shelter.minutes_since_update)}`]
  if (source) parts.push(source)
  return (
    <span className={`inline-flex items-start gap-1.5 text-[13px] font-medium ${f.text}`}>
      <span aria-hidden className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${f.dot}`} />
      <span>{parts.join(' · ')}</span>
    </span>
  )
}

export function RestrictionChips({ shelter }: { shelter: Shelter }) {
  const tags = FILTERS.filter((f) => shelter[f.key])
  if (!tags.length) return <p className="text-[13px] text-text-muted">No restrictions listed</p>
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Who this shelter serves">
      {tags.map(({ key, label, Icon }) => (
        <li key={key} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[13px] font-semibold text-text-2">
          <Icon aria-hidden size={16} strokeWidth={2} className="text-green-text" />
          {label}
        </li>
      ))}
    </ul>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}

export function CardSkeleton() {
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]" aria-hidden>
      <div className="flex gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-10 w-12" />
      </div>
      <Skeleton className="mt-3 h-12 w-full" />
    </div>
  )
}
