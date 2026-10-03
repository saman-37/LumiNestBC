import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Brand, DemoBadge } from './Brand'

/** Header + centred column used by every screen except the map. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-night text-ink">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)]">
        <Link to="/" className="rounded-lg focus-visible:outline-2 focus-visible:outline-light">
          <Brand compact />
        </Link>
        <DemoBadge />
      </header>
      <main className="mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-6">{children}</main>
    </div>
  )
}
