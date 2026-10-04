import { Minus, Plus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { bedsWord } from '../../lib/filters'
import { formatAgo } from '../../lib/format'
import type { EventSource, Freshness, Shelter } from '../../lib/types'
import { AnimatedNumber } from '../AnimatedNumber'
import { Button } from '../Button'

interface Props {
  shelter: Shelter
  busy: boolean
  onAdjust: (delta: 1 | -1) => void
  onSetCount: (count: number) => void
  onFull: () => void
  onReopen: (count: number) => void
}

// "Last update 5 min ago, from ___"
const SOURCE_PHRASES: Record<EventSource, string> = {
  tap: 'the Tap Board',
  undo: 'the Tap Board',
  sms: 'a staff text',
  staff: 'staff',
  hold: 'a hold',
  arrival: 'the Arrival tag',
  expiry: 'a hold expiring',
}

// The one freshness indicator on this page: green under 1 h, amber to 3 h, red after.
const FRESH_TEXT: Record<Freshness, string> = { green: 'text-green-text', amber: 'text-amber-text', red: 'text-red-text' }
const FRESH_DOT: Record<Freshness, string> = { green: 'bg-green', amber: 'bg-amber', red: 'bg-red' }

const STEP =
  'grid h-14 w-14 shrink-0 place-items-center rounded-[14px] border border-border-strong bg-surface text-text ' +
  'shadow-[var(--shadow-card)] active:scale-95 disabled:opacity-40'

/** Big count with −/+, an exact-number field, and Mark full / Reopen. */
export function CountPanel({ shelter, busy, onAdjust, onSetCount, onFull, onReopen }: Props) {
  const [exact, setExact] = useState(String(shelter.open_beds))
  useEffect(() => setExact(String(shelter.open_beds)), [shelter.open_beds])
  const parsed = /^\d+$/.test(exact.trim()) ? Number(exact) : null
  const max = shelter.capacity || undefined
  const atCapacity = !!max && shelter.open_beds >= max
  const closed = shelter.open_beds === 0 || !shelter.accepting
  const phrase = shelter.last_update_source ? SOURCE_PHRASES[shelter.last_update_source] : null

  function save(e: FormEvent) {
    e.preventDefault()
    if (parsed !== null) onSetCount(parsed)
  }

  return (
    <section aria-label="Beds open right now" className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <p className="text-center text-[15px] font-medium text-text-2">Beds open right now</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <button type="button" aria-label="Remove one open bed" className={STEP} disabled={busy || shelter.open_beds === 0} onClick={() => onAdjust(-1)}>
          <Minus aria-hidden size={26} />
        </button>
        <div className="min-w-0 text-center">
          <AnimatedNumber
            value={shelter.open_beds}
            className={`block font-display text-[64px] font-bold leading-none tracking-[-0.02em] ${shelter.open_beds > 0 ? 'text-green-text' : 'text-text'}`}
          />
          <span className="mt-1 block text-[13px] text-text-muted">
            {max ? `of ${max} ${bedsWord(max)}` : bedsWord(shelter.open_beds) + ' open'}
          </span>
        </div>
        <button type="button" aria-label="Add one open bed" className={STEP} disabled={busy || atCapacity} onClick={() => onAdjust(1)}>
          <Plus aria-hidden size={26} />
        </button>
      </div>
      {!shelter.accepting && (
        <p className="mt-3 rounded-[12px] bg-amber-tint px-3 py-2 text-center text-[13px] font-medium text-amber-text">
          Not accepting new people tonight (see settings below)
        </p>
      )}
      <p className={`mt-3 flex items-start justify-center gap-1.5 text-center text-[13px] font-medium ${FRESH_TEXT[shelter.freshness]}`}>
        <span aria-hidden className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${FRESH_DOT[shelter.freshness]}`} />
        <span>
          Updated {formatAgo(shelter.minutes_since_update)}
          {phrase && `, from ${phrase}`}
        </span>
      </p>

      <form onSubmit={save} className="mt-4 flex items-end gap-2">
        <label className="min-w-0 flex-1 text-[13px] text-text-2">
          Set exact number
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={exact}
            onChange={(e) => setExact(e.target.value)}
            aria-describedby="exact-hint"
            className="mt-1 block h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3 text-[16px] tabular focus:border-blue focus:outline-none"
          />
        </label>
        <div className="w-24 shrink-0">
          <Button type="submit" size="md" disabled={busy || parsed === null || parsed === shelter.open_beds}>
            Save
          </Button>
        </div>
      </form>
      {max ? (
        <p id="exact-hint" className="mt-1 text-[13px] text-text-muted">0 to {max}</p>
      ) : (
        <p id="exact-hint" className="sr-only">Any number from 0</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="md" disabled={busy || shelter.open_beds === 0} onClick={onFull}>
          Mark full
        </Button>
        <Button
          variant="outline-green"
          size="md"
          disabled={busy || !closed}
          onClick={() => onReopen(parsed && parsed > 0 ? parsed : 1)}
        >
          Reopen{parsed && parsed > 0 && closed ? ` (${parsed})` : ''}
        </Button>
      </div>
    </section>
  )
}
