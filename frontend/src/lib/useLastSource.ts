import { useEffect, useState } from 'react'
import { api } from './api'
import type { AvailabilityEvent, EventSource } from './types'

// Freshness only moves on staff actions, so the newest staff-sourced event explains it.
const STAFF_SOURCES: Partial<Record<EventSource, string>> = {
  tap: 'Tap Board',
  undo: 'Tap Board',
  arrival: 'Arrival tag',
  sms: 'Text',
}

export function lastStaffSource(events: AvailabilityEvent[]): string | null {
  for (const e of events) {
    const label = STAFF_SOURCES[e.source]
    if (label) return label
  }
  return null
}

/** Where a shelter's last confirmed update came from ("Tap Board", "Text"…), from its event log. */
export function useLastSource(shelterId: string | null, refreshKey: unknown): string | null {
  const [source, setSource] = useState<string | null>(null)
  useEffect(() => {
    if (!shelterId) return
    let cancelled = false
    api
      .shelterEvents(shelterId, 10)
      .then((events) => !cancelled && setSource(lastStaffSource(events)))
      .catch(() => !cancelled && setSource(null))
    return () => {
      cancelled = true
    }
  }, [shelterId, refreshKey])
  return shelterId ? source : null
}
