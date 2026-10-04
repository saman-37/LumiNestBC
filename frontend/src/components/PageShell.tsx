import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'

/** Header + centred column used by every screen except the map. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-text">
      <div className="sticky top-0 z-20">
        <AppHeader variant="glass" />
      </div>
      <main className="mx-auto w-full max-w-[480px] px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">{children}</main>
    </div>
  )
}
