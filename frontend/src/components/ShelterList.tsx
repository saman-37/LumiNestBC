import { ChevronDown, ChevronUp, Phone } from 'lucide-react'
import { lightLevel } from '../lib/filters'
import { formatKm } from '../lib/geo'
import type { Shelter } from '../lib/types'
import { FreshnessBadge } from './FreshnessBadge'

export interface ListedShelter {
  shelter: Shelter
  km: number | null
}

interface Props {
  listed: ListedShelter[]
  dv: Shelter[]
  bumped: Set<string>
  loading: boolean
  expanded: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

export const MAP_ATTRIBUTION = import.meta.env.VITE_CARTO_KEY
  ? '© OpenStreetMap contributors © CARTO'
  : '© OpenStreetMap contributors'

/** Bottom sheet listing the nearest shelters. DV shelters appear only here, never on the map. */
export function ShelterList({ listed, dv, bumped, loading, expanded, onToggle, onSelect }: Props) {
  const withBeds = listed.filter(({ shelter }) => shelter.open_beds > 0 && !shelter.is_full).length
  return (
    <section
      aria-label="Nearest shelters"
      className="absolute inset-x-0 bottom-0 z-[1000] rounded-t-3xl border-t border-line bg-surface/95 shadow-2xl backdrop-blur"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left focus-visible:outline-2 focus-visible:outline-light"
      >
        <span className="text-base font-semibold">
          {loading ? 'Finding lights…' : `${withBeds} ${withBeds === 1 ? 'shelter has' : 'shelters have'} open beds`}
        </span>
        {expanded ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
      </button>

      <ul className={`overflow-y-auto px-3 ${expanded ? 'max-h-[60dvh]' : 'max-h-[28dvh]'}`}>
        {listed.map(({ shelter, km }) => (
          <li key={shelter.id}>
            <button
              type="button"
              onClick={() => onSelect(shelter.id)}
              className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-light"
            >
              <span
                className={`count-dot light-${lightLevel(shelter.open_beds, shelter.is_full)} ${bumped.has(shelter.id) ? 'count-bump' : ''}`}
                aria-label={`${shelter.open_beds} open beds`}
              >
                {shelter.is_full ? 0 : shelter.open_beds}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold leading-snug">{shelter.name}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                  {km !== null && <span>{formatKm(km)}</span>}
                  <FreshnessBadge freshness={shelter.freshness} minutes={shelter.minutes_since_update} />
                </span>
              </span>
            </button>
          </li>
        ))}

        {dv.map((shelter) => (
          <li key={shelter.id} className="flex items-center gap-3 px-2 py-3">
            <span className={`count-dot light-${lightLevel(shelter.open_beds, shelter.is_full)}`}>
              {shelter.is_full ? 0 : shelter.open_beds}
            </span>
            <a
              href={`tel:${shelter.dv_phone ?? ''}`}
              className="flex min-h-14 flex-1 items-center gap-2 rounded-2xl px-2 font-semibold text-ink hover:bg-surface-2"
            >
              <Phone aria-hidden size={18} className="shrink-0 text-light" />
              <span className="break-words">
                {shelter.open_beds > 0 ? 'DV bed available' : 'DV beds full'}: call {shelter.dv_phone}
              </span>
            </a>
          </li>
        ))}

        {!loading && listed.length + dv.length === 0 && (
          <li className="px-2 py-4 text-muted">No shelters match these filters.</li>
        )}
      </ul>
      <p className="px-5 pb-[max(env(safe-area-inset-bottom),8px)] pt-1 text-[11px] text-muted">{MAP_ATTRIBUTION}</p>
    </section>
  )
}
