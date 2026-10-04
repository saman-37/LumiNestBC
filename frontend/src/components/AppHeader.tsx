import { Link } from 'react-router'
import { useShelterStore } from '../lib/shelterStore'

export const TAGLINE = 'Find the lights still on.'

export function Wordmark() {
  return (
    <Link to="/" className="block rounded-lg">
      <span className="block font-display text-[24px] font-bold leading-none tracking-[-0.02em] text-text">
        Luminest<span className="text-green-text">BC</span>
      </span>
      <span className="mt-1 block text-[13px] leading-tight text-text-muted">{TAGLINE}</span>
    </Link>
  )
}

/** Green "Live · n shelters" while the socket is up; amber "Reconnecting…" when it drops. */
export function LivePill() {
  const { connected, shelters } = useShelterStore()
  return (
    <span
      role="status"
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold ${
        connected ? 'border-green-tint-border bg-green-tint text-green-text' : 'border-banner-border bg-amber-tint text-amber-text'
      }`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${connected ? 'bg-green' : 'bg-amber'}`} />
      {connected ? `Live · ${shelters.length} shelters` : 'Reconnecting…'}
    </span>
  )
}

/** glass: frosted over content; bare: no background/border (inside another glass panel). */
export function AppHeader({ variant = 'solid' }: { variant?: 'solid' | 'glass' | 'bare' }) {
  const look = {
    solid: 'border-b border-border bg-surface',
    glass: 'glass-bar border-b border-border shadow-[var(--shadow-card)]',
    bare: '',
  }[variant]
  return (
    <header className={`flex items-center justify-between gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] ${look}`}>
      <Wordmark />
      <LivePill />
    </header>
  )
}
