import { Phone, X } from 'lucide-react'
import { formatKm } from '../lib/geo'
import type { Shelter } from '../lib/types'
import { Button, LinkButton } from './Button'
import { FreshnessBadge } from './FreshnessBadge'
import { RestrictionTags } from './RestrictionTags'
import { MAP_ATTRIBUTION } from './ShelterList'

interface Props {
  shelter: Shelter
  km: number | null
  bumped: boolean
  holding: boolean
  error: string | null
  onHold: () => void
  onClose: () => void
}

export function ShelterDetailSheet({ shelter, km, bumped, holding, error, onHold, onClose }: Props) {
  const beds = shelter.is_full ? 0 : shelter.open_beds
  const phone = shelter.is_dv ? shelter.dv_phone : shelter.staff_phone
  return (
    <section
      role="dialog"
      aria-labelledby="shelter-title"
      className="absolute inset-x-0 bottom-0 z-[1100] max-h-[85dvh] overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="shelter-title" className="break-words text-2xl font-bold leading-tight">
            {shelter.name}
          </h2>
          {shelter.address && <p className="mt-1 break-words text-muted">{shelter.address}</p>}
          {km !== null && <p className="mt-0.5 text-sm text-muted">{formatKm(km)} away</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid min-h-14 min-w-14 place-items-center rounded-full bg-surface-2 text-ink focus-visible:outline-2 focus-visible:outline-light"
        >
          <X aria-hidden />
        </button>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <span
          className={`text-7xl font-extrabold leading-none tabular-nums ${beds > 0 ? 'text-light' : 'text-muted'} ${bumped ? 'count-bump' : ''}`}
        >
          {beds}
        </span>
        <span className="pb-1.5 text-lg text-muted">
          {beds === 1 ? 'open bed' : 'open beds'}
          {shelter.capacity > 0 && ` of ${shelter.capacity}`}
        </span>
      </div>
      <div className="mt-3">
        <FreshnessBadge freshness={shelter.freshness} minutes={shelter.minutes_since_update} />
      </div>
      <div className="mt-4">
        <RestrictionTags shelter={shelter} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-stale/50 bg-stale/10 p-3 text-ink">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-3">
        {!shelter.is_dv && (
          <Button onClick={onHold} disabled={beds < 1 || holding}>
            {holding ? 'Holding…' : beds < 1 ? 'No beds to hold' : 'Hold a bed for 60 min'}
          </Button>
        )}
        {phone && (
          <LinkButton variant="secondary" href={`tel:${phone}`}>
            <Phone aria-hidden size={20} /> Call {phone}
          </LinkButton>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted">{MAP_ATTRIBUTION}</p>
    </section>
  )
}
