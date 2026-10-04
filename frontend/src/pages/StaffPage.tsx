import { Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { PageShell } from '../components/PageShell'
import { Skeleton } from '../components/Status'
import { StaffTextMessage } from '../components/StaffTextMessage'
import { api } from '../lib/api'
import { bedsWord } from '../lib/filters'
import { formatAgo, formatClock, formatCountdown, useNow } from '../lib/format'
import { useShelterUpdates } from '../lib/socket'
import type { AvailabilityEvent, Hold, Shelter } from '../lib/types'
import { lastStaffSource } from '../lib/useLastSource'

// TODO(Frontend+Backend): no auth yet. Gate this page with the shelter's tag key before real use.

const SOURCE_PHRASE: Record<string, string> = {
  'Tap Board': 'the Tap Board',
  'Arrival tag': 'the Arrival tag',
  Text: 'a staff text',
}

function eventText(e: AvailabilityEvent): ReactNode {
  const green = (t: string) => <span className="font-semibold text-green-text">{t}</span>
  const red = (t: string) => <span className="font-semibold text-red-text">{t}</span>
  const blue = (t: string) => <span className="font-semibold text-blue-light">{t}</span>
  const amber = (t: string) => <span className="font-semibold text-amber-text">{t}</span>
  const extra = Math.abs(e.delta) > 1 ? ` (${e.delta > 0 ? '+' : ''}${e.delta})` : ''
  switch (e.source) {
    case 'tap':
      if (e.delta > 0) return <>{green('Bed freed')}{extra} on the Tap Board</>
      if (e.delta < 0 && e.open_beds_after === 0 && e.delta < -1) return <>{red('Marked full')} on the Tap Board</>
      if (e.delta < 0) return <>{red('Bed filled')} on the Tap Board</>
      return <span className="text-text-muted">Tap Board tap, no change</span>
    case 'undo':
      return <>{amber('Undo')}: last tap reversed{extra}</>
    case 'hold':
      return e.delta < 0 ? <>{blue('Bed held')} by an outreach worker</> : <>{blue('Hold released')}, bed back</>
    case 'arrival':
      return <>{green('Arrival confirmed')} at the door</>
    case 'expiry':
      return <>{amber('Hold expired')}, bed back</>
    case 'sms':
      return <StaffTextMessage chips={['Read by AI', `Beds: ${e.open_beds_after}`]} />
  }
}

export default function StaffPage() {
  const { shelterId = '' } = useParams()
  const now = useNow(1000)
  const [shelter, setShelter] = useState<Shelter | null>(null)
  const [holds, setHolds] = useState<Hold[]>([])
  const [events, setEvents] = useState<AvailabilityEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [s, h, e] = await Promise.all([api.shelter(shelterId), api.shelterHolds(shelterId), api.shelterEvents(shelterId, 15)])
      setShelter(s)
      setHolds(h)
      setEvents(e)
      setError(null)
    } catch {
      setError("Can't load this shelter.")
    }
  }, [shelterId])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  useShelterUpdates((s) => {
    if (s.id === shelterId) load()
  })

  if (!shelter)
    return (
      <PageShell>
        {error ? (
          <p className="text-[15px] text-text-3">{error}</p>
        ) : (
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-[220px] w-full rounded-[20px]" />
            <Skeleton className="h-20 w-full rounded-[16px]" />
          </div>
        )}
      </PageShell>
    )

  const fresh = shelter.freshness === 'green'
  const source = lastStaffSource(events)

  return (
    <PageShell>
      <p className="text-[13px] font-normal uppercase tracking-wide text-text-muted">Staff view</p>
      <div className="mt-0.5 flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-[22px] font-bold leading-tight">{shelter.name}</h1>
        <span
          className={`mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold ${
            fresh
              ? 'border-green-tint-border bg-green-tint text-green-text'
              : shelter.freshness === 'amber'
                ? 'border-banner-border bg-amber-tint text-amber-text'
                : 'border-red-tint-border bg-red-tint text-red-text'
          }`}
        >
          <span aria-hidden className={`h-2 w-2 rounded-full ${fresh ? 'bg-green' : shelter.freshness === 'amber' ? 'bg-amber' : 'bg-red'}`} />
          {fresh ? 'Data is fresh' : 'Update needed'}
        </span>
      </div>

      <section className="mt-4 rounded-[20px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]" aria-label="Beds open right now">
        <p className="text-center text-[13px] font-medium text-text-3">Beds open right now</p>
        <div className="mt-2 grid grid-cols-[56px_1fr_56px] items-center gap-2">
          {/* Manual adjust needs a staff API (tag secrets are per action). Disabled until Backend adds it. */}
          <button type="button" disabled aria-label="Remove one bed (coming soon)" className="grid h-14 w-14 place-items-center rounded-[14px] border border-border-strong text-text-2 disabled:opacity-40">
            <Minus aria-hidden size={24} />
          </button>
          <div className="text-center">
            <AnimatedNumber
              value={shelter.open_beds}
              className={`block font-display text-[64px] font-bold tracking-[-0.02em] leading-none ${shelter.open_beds > 0 ? 'text-green-text' : 'text-text'}`}
            />
            {shelter.capacity > 0 && <span className="mt-1 block text-[13px] text-text-muted">of {shelter.capacity} beds</span>}
          </div>
          <button type="button" disabled aria-label="Add one bed (coming soon)" className="grid h-14 w-14 place-items-center rounded-[14px] border border-border-strong text-text-2 disabled:opacity-40">
            <Plus aria-hidden size={24} />
          </button>
        </div>
        <p className="mt-3 text-center text-[13px] text-text-muted">
          Last update {formatAgo(shelter.minutes_since_update)}
          {source && `, from ${SOURCE_PHRASE[source] ?? source}`}
        </p>
        <p className="mt-1 text-center text-[13px] text-text-muted">Use the Tap Board at the front desk to change the count.</p>
      </section>

      <section className="mt-5" aria-labelledby="incoming">
        <h2 id="incoming" className="text-[13px] font-normal uppercase tracking-wide text-blue-light">
          Incoming
        </h2>
        <ul className="mt-2 grid gap-2">
          <AnimatePresence initial={false}>
            {holds.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: -8, backgroundColor: '#cfe0fd' }}
                animate={{ opacity: 1, y: 0, backgroundColor: '#e8f0fe' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.5, backgroundColor: { duration: 1.6 } }}
                className="flex items-center gap-3 rounded-[16px] border border-blue-tint-border p-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-bold text-text">1 bed held by {h.worker_name}</span>
                  <span className="block break-words text-[13px] text-blue-light">{h.worker_org} · arriving</span>
                </span>
                <span className="tabular shrink-0 font-display text-[22px] font-bold text-blue-light" aria-label="Time left on hold">
                  {formatCountdown(Date.parse(h.expires_at) - now)}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
          {holds.length === 0 && (
            <li className="rounded-[16px] border border-border bg-surface-2 p-4 text-[15px] text-text-muted">No incoming holds right now.</li>
          )}
        </ul>
      </section>

      <section className="mt-5" aria-labelledby="recent">
        <h2 id="recent" className="text-[13px] font-normal uppercase tracking-wide text-text-muted">
          Recent updates
        </h2>
        {events.length === 0 ? (
          <p className="mt-2 text-[15px] text-text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-divider rounded-[16px] border border-border bg-surface shadow-[var(--shadow-card)]">
            {events.map((e, i) => (
              <li key={`${e.time}-${i}`} className="flex items-start gap-2 px-4 py-3 text-[15px] text-text-2">
                <span className="tabular w-[58px] shrink-0 whitespace-nowrap pt-px text-[13px] text-text-muted">{formatClock(e.time)}</span>
                <span className="min-w-0 flex-1">{eventText(e)}</span>
                <span className="tabular shrink-0 whitespace-nowrap text-[13px] text-text-muted">
                  {e.open_beds_after} {bedsWord(e.open_beds_after)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  )
}
