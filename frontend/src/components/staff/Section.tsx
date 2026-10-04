import type { ReactNode } from 'react'

/** A titled white card used by every block of the staff portal and admin hub. */
export function Section({ title, aside, children, id }: { title: string; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="font-display text-[18px] font-bold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Inline "are you sure?" row used before destructive actions. */
export function ConfirmRow({
  question,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  question: string
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="mt-2 rounded-[12px] border border-border-strong bg-surface-2 p-3">
      <p className="text-[15px] font-medium">{question}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-[12px] border border-border-strong bg-surface font-semibold">
          Keep
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-12 rounded-[12px] bg-green-strong font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}
