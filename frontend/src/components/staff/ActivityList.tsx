import { BedDouble, DoorOpen, Hourglass, MessageSquareText, Nfc, Undo2, UserRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { formatClock } from '../../lib/format'
import type { AvailabilityEvent, EventSource } from '../../lib/types'
import { ConfirmRow, Section } from './Section'

const ICONS: Record<EventSource, { Icon: LucideIcon; label: string }> = {
  tap: { Icon: Nfc, label: 'Tap Board' },
  undo: { Icon: Undo2, label: 'Tap Board' },
  sms: { Icon: MessageSquareText, label: 'Text' },
  staff: { Icon: UserRound, label: 'Staff' },
  hold: { Icon: BedDouble, label: 'Hold' },
  arrival: { Icon: DoorOpen, label: 'Arrival' },
  expiry: { Icon: Hourglass, label: 'Hold expired' },
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0')

function describe(e: AvailabilityEvent): string {
  switch (e.source) {
    case 'tap':
      if (e.delta > 0) return 'Bed freed'
      if (e.delta < 0 && e.open_beds_after === 0 && e.delta < -1) return 'Marked full'
      return e.delta < 0 ? 'Bed filled' : 'Tap, no change'
    case 'undo':
      return 'Tap undone'
    case 'sms':
      return e.delta ? `Text update ${signed(e.delta)}` : 'Text update, no change'
    case 'staff':
      if (e.reverts_event_id) return 'Reverted a change'
      return e.delta ? `Changed ${signed(e.delta)}` : 'Confirmed / settings saved'
    case 'hold':
      return e.delta < 0 ? 'Bed held by an outreach worker' : 'Hold released'
    case 'arrival':
      return 'Arrival confirmed'
    case 'expiry':
      return 'Hold expired, bed back'
  }
}

interface Props {
  events: AvailabilityEvent[]
  openBeds: number
  windowMinutes: number
  busy: boolean
  onRevert: (event: AvailabilityEvent) => void
}

/** Recent changes. Tap/text/staff changes from the last hour can be reverted once. */
export function ActivityList({ events, openBeds, windowMinutes, busy, onRevert }: Props) {
  const [confirming, setConfirming] = useState<number | null>(null)

  return (
    <Section title="Recent activity" id="activity">
      {events.length === 0 ? (
        <p className="text-[15px] text-text-muted">Nothing yet.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-divider">
          {events.map((e) => {
            const { Icon, label } = ICONS[e.source]
            const after = Math.max(0, openBeds - e.delta)
            return (
              <li key={e.id} className="px-1 py-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-text-2" title={label}>
                    <Icon aria-hidden size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] ${e.reverted ? 'text-text-muted line-through' : 'text-text'}`}>{describe(e)}</p>
                    <p className="text-[13px] text-text-muted">
                      {formatClock(e.time)} · {label} · {e.open_beds_after} open after
                      {e.reverted && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 font-semibold no-underline">Reverted</span>}
                    </p>
                  </div>
                  {e.revertable && confirming !== e.id && (
                    <button
                      type="button"
                      onClick={() => setConfirming(e.id)}
                      disabled={busy}
                      className="min-h-11 shrink-0 rounded-[12px] border border-border-strong px-3 text-[15px] font-semibold text-text hover:bg-surface-2 disabled:opacity-50"
                    >
                      Revert
                    </button>
                  )}
                </div>
                {confirming === e.id && (
                  <ConfirmRow
                    question={`Undo this ${signed(e.delta)}? The count will go from ${openBeds} to ${after}.`}
                    confirmLabel="Revert"
                    busy={busy}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => {
                      setConfirming(null)
                      onRevert(e)
                    }}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-2 text-[13px] text-text-muted">
        Tap Board, text and staff changes can be reverted for {windowMinutes} minutes.
      </p>
    </Section>
  )
}
