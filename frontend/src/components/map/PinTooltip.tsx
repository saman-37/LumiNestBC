import { bedsWord, FILTERS, shelterState } from '../../lib/filters'
import { formatAgo, formatKm } from '../../lib/format'
import type { Shelter } from '../../lib/types'
import { ShelterPhoto } from '../ShelterPhoto'

/** Dark slate place card shown above a pin (hover on desktop, tap on mobile), Google Maps style. */
export function PinTooltip({ shelter, km, compact = false }: { shelter: Shelter; km: number | null; compact?: boolean }) {
  const state = shelterState(shelter)
  const tags = FILTERS.filter((f) => shelter[f.key])
  const beds =
    !shelter.accepting
      ? 'Not accepting tonight'
      : state === 'full'
      ? 'Full tonight'
      : state === 'stale'
        ? `${shelter.open_beds} ${bedsWord(shelter.open_beds)}, unconfirmed`
        : `${shelter.open_beds} ${bedsWord(shelter.open_beds)} open`
  const dot = state === 'full' ? 'bg-pin-grey' : state === 'stale' ? 'bg-red' : 'bg-green'

  return (
    <div className={`flex max-w-[calc(100vw-40px)] gap-3 p-3 text-left ${compact ? 'w-[260px] items-center' : 'w-[300px]'}`}>
      <ShelterPhoto shelter={shelter} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-[15px] font-bold leading-snug text-tooltip-title">{shelter.name}</span>
        {!compact && shelter.address && <span className="mt-0.5 block break-words text-[13px] leading-snug text-tooltip-body">{shelter.address}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-tooltip-body">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-semibold text-tooltip-title">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            {beds}
          </span>
          {!compact && <span>Updated {formatAgo(shelter.minutes_since_update)}</span>}
          {km !== null && <span>{compact ? '' : '· '}{formatKm(km)}</span>}
        </span>
        {!compact && tags.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5" aria-label={tags.map((t) => t.label).join(', ')}>
            {tags.map(({ key, label, Icon }) => (
              <span key={key} title={label} className="grid h-6 w-6 place-items-center rounded-full bg-white/10">
                <Icon aria-hidden size={14} className="text-tooltip-title" />
              </span>
            ))}
          </span>
        )}
      </span>
    </div>
  )
}
