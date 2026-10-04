import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { formatCountdown, useNow } from '../../lib/format'
import type { Hold } from '../../lib/types'
import { ConfirmRow, Section } from './Section'

/** Incoming holds. Staff can release one if the person never arrived. */
interface Props {
  holds: Hold[]
  busy: boolean
  onArrive: (hold: Hold) => void
  onRelease: (hold: Hold) => void
}

/** Incoming holds. Staff confirm an arrival here (same as the Arrival tag) or release a no-show. */
export function HoldsList({ holds, busy, onArrive, onRelease }: Props) {
  const now = useNow(1000)
  const [confirming, setConfirming] = useState<string | null>(null)

  return (
    <Section title="Incoming holds" id="holds">
      {holds.length === 0 ? (
        <p className="text-[15px] text-text-muted">No incoming holds right now.</p>
      ) : (
        <ul className="grid gap-2">
          <AnimatePresence initial={false}>
            {holds.map((h) => (
              <motion.li
                key={h.id}
                layout
                initial={{ opacity: 0, y: -8, backgroundColor: '#cfe0fd' }}
                animate={{ opacity: 1, y: 0, backgroundColor: '#e8f0fe' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.4, backgroundColor: { duration: 1.6 } }}
                className="rounded-[16px] border border-blue-tint-border p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-[16px] font-bold">{h.worker_name}</p>
                    <p className="break-words text-[13px] text-blue-light">{h.worker_org} · arriving</p>
                  </div>
                  <span className="tabular shrink-0 font-display text-[22px] font-bold text-blue-light" aria-label="Time left on hold">
                    {formatCountdown(Date.parse(h.expires_at) - now)}
                  </span>
                </div>
                {confirming === h.id ? (
                  <ConfirmRow
                    question={`Release ${h.worker_name}'s hold? The bed goes back on the map.`}
                    confirmLabel="Release"
                    busy={busy}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => {
                      setConfirming(null)
                      onRelease(h)
                    }}
                  />
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onArrive(h)}
                      disabled={busy}
                      className="min-h-11 rounded-[12px] bg-green-strong px-2 text-[15px] font-semibold text-white disabled:opacity-50"
                    >
                      Mark arrived
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(h.id)}
                      disabled={busy}
                      className="min-h-11 rounded-[12px] border border-blue-tint-border bg-surface px-2 text-[15px] font-semibold text-blue-light disabled:opacity-50"
                    >
                      Didn't arrive
                    </button>
                  </div>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Section>
  )
}
