import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { FreshnessBadge } from '../components/FreshnessBadge'
import { PageShell } from '../components/PageShell'
import { api } from '../lib/api'
import { formatClock, minutesUntil, useNow } from '../lib/format'
import { useShelterUpdates } from '../lib/socket'
import type { AvailabilityEvent, EventSource, Hold, Shelter } from '../lib/types'

// TODO(Frontend+Backend): no auth yet. Gate this page with the shelter's tag key before real use.

const SOURCE_LABELS: Record<EventSource, string> = {
  tap: 'tag tap',
  sms: 'staff text',
  hold: 'hold',
  arrival: 'arrival',
  expiry: 'hold expired',
  undo: 'undo',
}

export default function StaffPage() {
  const { shelterId = '' } = useParams()
  const now = useNow(15_000)
  const [shelter, setShelter] = useState<Shelter | null>(null)
  const [holds, setHolds] = useState<Hold[]>([])
  const [events, setEvents] = useState<AvailabilityEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [bumped, setBumped] = useState(false)

  const load = useCallback(async () => {
    try {
      const [s, h, e] = await Promise.all([
        api.shelter(shelterId),
        api.shelterHolds(shelterId),
        api.shelterEvents(shelterId, 15),
      ])
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
    if (s.id !== shelterId) return
    if (shelter && s.open_beds !== shelter.open_beds) {
      setBumped(true)
      setTimeout(() => setBumped(false), 1_200)
    }
    load()
  })

  if (!shelter)
    return (
      <PageShell>
        <p className="text-lg text-muted">{error ?? 'Loading…'}</p>
      </PageShell>
    )

  return (
    <PageShell>
      <p className="text-sm font-semibold uppercase tracking-wide text-light">Shelter dashboard</p>
      <h1 className="break-words text-2xl font-bold leading-tight">{shelter.name}</h1>

      <div className="mt-6 flex items-end gap-3">
        <span className={`text-8xl font-extrabold leading-none tabular-nums ${shelter.open_beds > 0 ? 'text-light' : 'text-ink'} ${bumped ? 'count-bump' : ''}`}>
          {shelter.open_beds}
        </span>
        <span className="pb-2 text-lg text-muted">
          {shelter.open_beds === 1 ? 'open bed' : 'open beds'}
          {shelter.capacity > 0 && ` of ${shelter.capacity}`}
        </span>
      </div>
      <div className="mt-3">
        <FreshnessBadge freshness={shelter.freshness} minutes={shelter.minutes_since_update} />
      </div>

      <section className="mt-8" aria-labelledby="holds-title">
        <h2 id="holds-title" className="text-lg font-bold">Incoming holds</h2>
        {holds.length === 0 ? (
          <p className="mt-2 text-muted">No incoming holds.</p>
        ) : (
          <ul className="mt-2 grid gap-2">
            {holds.map((h) => (
              <li key={h.id} className="rounded-2xl bg-surface p-4">
                <p className="break-words text-lg font-semibold">{h.worker_name}</p>
                <p className="break-words text-muted">{h.worker_org}</p>
                <p className="mt-1 text-sm">
                  Expires in <span className="font-semibold">{minutesUntil(h.expires_at, now)} min</span> ({formatClock(h.expires_at)})
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8" aria-labelledby="events-title">
        <h2 id="events-title" className="text-lg font-bold">Recent changes</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-2xl bg-surface">
            {events.map((e, i) => (
              <li key={`${e.time}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted">{formatClock(e.time)}</span>
                <span className="w-8 shrink-0 text-right font-bold tabular-nums">{e.delta > 0 ? `+${e.delta}` : e.delta}</span>
                <span className="min-w-0 flex-1">{SOURCE_LABELS[e.source]}</span>
                <span className="shrink-0 text-sm text-muted">→ {e.open_beds_after}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">Update the count with the tags at the front desk.</p>
    </PageShell>
  )
}
