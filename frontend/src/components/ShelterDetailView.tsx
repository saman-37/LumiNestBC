import { ArrowRight, Copy, Navigation, Phone } from 'lucide-react'
import { useAnimate } from 'motion/react'
import { useEffect } from 'react'
import { bedsWord, shelterState } from '../lib/filters'
import { formatKm, formatWalk, sourceLabel } from '../lib/format'
import type { Shelter } from '../lib/types'
import { AnimatedNumber } from './AnimatedNumber'
import { Button, LinkButton } from './Button'
import type { ListedShelter } from './ShelterCard'
import { ShelterPhoto } from './ShelterPhoto'
import { FreshnessLine, FreshnessPill, RestrictionChips } from './Status'
import { useToast } from './Toast'

interface Props {
  shelter: Shelter
  km: number | null
  holding: boolean
  /** Increments on a 409 just_taken to replay the shake. */
  shakeKey: number
  nextBest: ListedShelter | null
  onHold: (shelter: Shelter) => void
  onSelect: (id: string) => void
}

export function directionsUrl(s: Shelter): string | null {
  if (s.lat !== null && s.lng !== null) return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  if (s.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.address)}`
  return null
}

export function ShelterDetailView({ shelter, km, holding, shakeKey, nextBest, onHold, onSelect }: Props) {
  const toast = useToast()
  const [scope, animate] = useAnimate()
  const state = shelterState(shelter)
  const open = state === 'open' || state === 'open-one'
  const beds = state === 'full' ? 0 : shelter.open_beds
  const canHold = shelter.open_beds > 0 && !shelter.is_full && shelter.accepting // stale counts can still be held
  const directions = directionsUrl(shelter)

  useEffect(() => {
    if (shakeKey && scope.current) animate(scope.current, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.45 })
  }, [shakeKey, animate, scope])

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(shelter.address ?? '')
      toast('Address copied', 'success')
    } catch {
      toast("Couldn't copy the address", 'error')
    }
  }

  return (
    <div ref={scope} className="pb-2">
      <div className="mb-3">
        <ShelterPhoto shelter={shelter} size="lg" />
      </div>
      <h2 className="break-words font-display text-[22px] font-bold leading-tight">{shelter.name}</h2>
      {shelter.address && (
        <div className="mt-1 flex items-start gap-1">
          <p className="min-w-0 flex-1 break-words pt-2.5 text-[15px] text-text-3">{shelter.address}</p>
          <button
            type="button"
            onClick={copyAddress}
            aria-label="Copy address"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] text-text-muted hover:bg-surface-2"
          >
            <Copy aria-hidden size={18} />
          </button>
        </div>
      )}
      {km !== null && (
        <p className="text-[13px] text-text-muted">
          {formatKm(km)} · {formatWalk(km)}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 rounded-[16px] border border-border bg-surface-2 p-4">
        <div className="flex items-end gap-2">
          <AnimatedNumber
            value={beds}
            suffix={state === 'stale' ? '?' : ''}
            className={`font-display text-[56px] font-bold tracking-[-0.02em] leading-[0.9] ${open ? 'text-green-text' : 'text-text-muted'}`}
          />
          <span className="pb-1 text-[15px] text-text-3">
            {state === 'stale' ? 'unconfirmed' : state === 'full' ? 'full tonight' : `${bedsWord(beds)} open`}
          </span>
        </div>
        <FreshnessPill freshness={shelter.freshness} />
        <div className="w-full">
          <FreshnessLine shelter={shelter} source={sourceLabel(shelter.last_update_source)} />
        </div>
      </div>

      <div className="mt-4">
        <RestrictionChips shelter={shelter} />
      </div>

      <div className="mt-5 grid gap-2.5">
        <Button disabled={!canHold || holding} onClick={() => onHold(shelter)}>
          {holding ? 'Holding…' : canHold ? 'Hold a bed for 60 min' : shelter.accepting ? 'Full tonight' : 'Not accepting tonight'}
        </Button>
        <div className="grid grid-cols-2 gap-2.5">
          {shelter.staff_phone ? (
            <LinkButton variant="outline" size="md" href={`tel:${shelter.staff_phone}`}>
              <Phone aria-hidden size={18} /> Call
            </LinkButton>
          ) : (
            <Button variant="outline" size="md" disabled>
              <Phone aria-hidden size={18} /> Call
            </Button>
          )}
          {directions ? (
            <LinkButton variant="outline" size="md" href={directions} target="_blank" rel="noreferrer">
              <Navigation aria-hidden size={18} /> Directions
            </LinkButton>
          ) : (
            <Button variant="outline" size="md" disabled>
              <Navigation aria-hidden size={18} /> Directions
            </Button>
          )}
        </div>
      </div>

      {nextBest && (
        <button
          type="button"
          onClick={() => onSelect(nextBest.shelter.id)}
          className="mt-4 flex w-full items-center gap-3 rounded-[16px] border border-green-tint-border bg-green-tint p-3.5 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-normal uppercase tracking-wide text-green-text">Next best match</span>
            <span className="block break-words text-[15px] font-bold text-text">{nextBest.shelter.name}</span>
            <span className="block text-[13px] text-text-3">
              {nextBest.shelter.open_beds} {bedsWord(nextBest.shelter.open_beds)} open
              {nextBest.km !== null && ` · ${formatKm(nextBest.km)}`}
            </span>
          </span>
          <ArrowRight aria-hidden size={20} className="shrink-0 text-green-text" />
        </button>
      )}
    </div>
  )
}
