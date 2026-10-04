import { Phone, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { bedsWord, FILTERS, shelterState } from '../lib/filters'
import { formatKm, sourceLabel } from '../lib/format'
import type { Shelter } from '../lib/types'
import { AnimatedNumber } from './AnimatedNumber'
import { Button, LinkButton } from './Button'
import { ShelterPhoto } from './ShelterPhoto'
import { FreshnessLine } from './Status'

export interface ListedShelter {
  shelter: Shelter
  km: number | null
}

// Cards collapse out of the list (height + fade) when a filter hides them. Clipping is only
// on while animating, so the card shadow isn't cut off at rest.
function useCollapse() {
  const [clip, setClip] = useState(false) // cards present on first render never animate
  return {
    layout: true,
    initial: { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: { opacity: 0, height: 0 },
    transition: { type: 'spring', stiffness: 380, damping: 38, opacity: { duration: 0.2 } },
    onAnimationStart: () => setClip(true),
    onAnimationComplete: () => setClip(false),
    style: { overflow: clip ? 'hidden' : 'visible' },
  } as const
}

export function metaLine(shelter: Shelter, km: number | null): string {
  const parts = km !== null ? [formatKm(km)] : []
  for (const f of FILTERS) if (shelter[f.key]) parts.push(f.short)
  return parts.join(' · ')
}

interface CardProps {
  item: ListedShelter
  best: boolean
  holding: boolean
  onSelect: (id: string) => void
  onHold: (shelter: Shelter) => void
}

export function ShelterCard({ item: { shelter, km }, best, holding, onSelect, onHold }: CardProps) {
  const collapse = useCollapse()
  const state = shelterState(shelter)
  const open = state === 'open' || state === 'open-one'
  const caption = !shelter.accepting
    ? 'not accepting'
    : state === 'stale' ? 'unconfirmed' : state === 'full' ? 'full tonight' : `${bedsWord(shelter.open_beds)} open`

  return (
    <motion.li {...collapse}>
      <article className="mb-3 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <button type="button" onClick={() => onSelect(shelter.id)} className="flex w-full gap-3 rounded-[12px] text-left">
          <ShelterPhoto shelter={shelter} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block break-words text-[16px] font-bold leading-snug text-text">{shelter.name}</span>
            <span className="mt-0.5 block text-[13px] text-text-muted">{metaLine(shelter, km)}</span>
            <span className="mt-1.5 block">
              <FreshnessLine shelter={shelter} source={sourceLabel(shelter.last_update_source)} />
            </span>
          </span>
          <span className="shrink-0 text-right">
            <AnimatedNumber
              value={state === 'full' ? 0 : shelter.open_beds}
              suffix={state === 'stale' ? '?' : ''}
              className={`block font-display text-[30px] font-bold leading-none ${open ? 'text-green-text' : 'text-text-muted'}`}
            />
            <span className="mt-1 block text-[13px] text-text-muted">{caption}</span>
          </span>
        </button>

        {state !== 'full' && (
        <div className="mt-3">
          {open && (
            <Button
              variant={best ? 'primary' : 'outline-green'}
              size={best ? 'lg' : 'md'}
              disabled={holding}
              onClick={() => onHold(shelter)}
            >
              {holding ? 'Holding…' : 'Hold a bed for 60 min'}
            </Button>
          )}
          {state === 'stale' &&
            (shelter.staff_phone ? (
              <LinkButton variant="outline" size="md" href={`tel:${shelter.staff_phone}`}>
                <Phone aria-hidden size={18} /> Call to confirm
              </LinkButton>
            ) : (
              <p className="py-2 text-center text-[15px] font-medium text-text-muted">Count unconfirmed</p>
            ))}
        </div>
        )}
      </article>
    </motion.li>
  )
}

/** DV shelters: no distance, no address, no hold. Just a way to call. */
export function DvCard({ shelter }: { shelter: Shelter }) {
  const collapse = useCollapse()
  const available = shelter.open_beds > 0 && !shelter.is_full
  return (
    <motion.li {...collapse}>
      <article className="mb-3 rounded-[16px] border border-blue-tint-border bg-blue-tint p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden size={22} className="mt-0.5 shrink-0 text-blue" />
          <div className="min-w-0">
            <p className="text-[16px] font-bold text-text">
              {available ? 'Safe-housing bed available' : 'Safe-housing: call for options'}
            </p>
            <p className="mt-0.5 text-[13px] text-text-3">Confidential location. Call to be connected.</p>
          </div>
        </div>
        {shelter.dv_phone && (
          <LinkButton variant="outline" size="md" href={`tel:${shelter.dv_phone}`} className="mt-3 border-blue bg-surface text-blue-light hover:bg-blue-tint">
            <Phone aria-hidden size={18} /> Call {shelter.dv_phone}
          </LinkButton>
        )}
      </article>
    </motion.li>
  )
}
