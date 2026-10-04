import { MoonStar } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { shelterState } from '../lib/filters'
import { formatKm } from '../lib/format'
import type { Shelter } from '../lib/types'
import { AnimatedNumber } from './AnimatedNumber'
import { Button } from './Button'
import { DvCard, ShelterCard, type ListedShelter } from './ShelterCard'
import { CardSkeleton } from './Status'

/** "{n} matches nearby": n counts only non-DV shelters matching the filters with at least 1 open bed. */
export function ListHeader({ count, loading }: { count: number; loading: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-3 pt-1">
      <h2 className="font-display text-[18px] font-bold">
        {loading ? (
          'Finding lights…'
        ) : (
          <>
            <AnimatedNumber value={count} /> {count === 1 ? 'match' : 'matches'} nearby
          </>
        )}
      </h2>
      <span className="shrink-0 text-[13px] text-text-muted">Sorted by distance</span>
    </div>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <motion.li
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pb-2 pt-3 text-[13px] font-normal uppercase tracking-wide text-text-muted"
    >
      {children}
    </motion.li>
  )
}

interface Props {
  /** non-DV, matching filters, at least 1 open bed, nearest first */
  open: ListedShelter[]
  /** non-DV, matching filters, full tonight, nearest first */
  full: ListedShelter[]
  dv: Shelter[]
  loading: boolean
  bestId: string | null
  holdingId: string | null
  filtersActive: boolean
  nearestOverall: ListedShelter | null
  onSelect: (id: string) => void
  onHold: (shelter: Shelter) => void
  onClearFilters: () => void
}

export function ShelterListView(props: Props) {
  const { open, full, dv, loading, bestId, holdingId, filtersActive, nearestOverall, onSelect, onHold, onClearFilters } = props

  if (loading)
    return (
      <div className="grid gap-3" aria-busy="true" aria-label="Loading shelters">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    )

  return (
    <>
      {open.length === 0 && (
        <div className="mb-1 rounded-[16px] border border-border bg-surface p-5 text-center shadow-[var(--shadow-card)]">
          <MoonStar aria-hidden size={28} className="mx-auto text-text-muted" />
          <p className="mt-2 font-display text-[18px] font-bold">No lights match these filters right now.</p>
          {nearestOverall && (
            <button
              type="button"
              onClick={() => onSelect(nearestOverall.shelter.id)}
              className="mt-3 w-full rounded-[12px] border border-border bg-surface-2 px-3 py-2.5 text-left text-[15px] text-text-2 hover:bg-green-tint"
            >
              Closest shelter overall: <span className="font-semibold text-text">{nearestOverall.shelter.name}</span>
              {nearestOverall.km !== null && ` · ${formatKm(nearestOverall.km)}`}
              {' · '}
              {shelterState(nearestOverall.shelter) === 'full' ? 'full tonight' : `${nearestOverall.shelter.open_beds} open`}
            </button>
          )}
          {filtersActive && (
            <Button variant="outline-green" size="md" className="mt-3" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      )}

      <ul>
        <AnimatePresence initial={false}>
          {open.map((item) => (
            <ShelterCard
              key={item.shelter.id}
              item={item}
              best={item.shelter.id === bestId}
              holding={holdingId === item.shelter.id}
              onSelect={onSelect}
              onHold={onHold}
            />
          ))}
          {full.length > 0 && <SectionLabel key="label-full">Full tonight</SectionLabel>}
          {full.map((item) => (
            <ShelterCard key={item.shelter.id} item={item} best={false} holding={false} onSelect={onSelect} onHold={onHold} />
          ))}
          {dv.length > 0 && <SectionLabel key="label-dv">Confidential safe housing</SectionLabel>}
          {dv.map((s) => (
            <DvCard key={s.id} shelter={s} />
          ))}
        </AnimatePresence>
      </ul>
    </>
  )
}
