import { KeyRound } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { NavLink } from 'react-router'
import { adminApi, ApiError } from '../../lib/api'
import { getAdminKey, saveAdminKey } from '../../lib/keys'
import { Button } from '../Button'
import { PageShell } from '../PageShell'

const TABS = [
  { to: '/admin', label: 'Shelters', end: true },
  { to: '/admin/voice', label: 'Voice line' },
  { to: '/admin/sms', label: 'SMS' },
]

const GATE_ERRORS: Record<string, string> = {
  not_found: 'Dev tools are off on this server (DEV_TOOLS_ENABLED=false).',
  admin_key_not_set: 'Set ADMIN_KEY in .env and restart the backend.',
  invalid_admin_key: "That key isn't right.",
  network_error: "Can't reach the backend.",
}

/**
 * Hidden admin / test hub (/admin). Asks for the admin key once and keeps it in
 * localStorage; children get the verified key.
 */
export function AdminShell({ title, children }: { title: string; children: (key: string) => ReactNode }) {
  const [key, setKey] = useState<string | null>(() => getAdminKey())
  const [verified, setVerified] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    adminApi
      .shelters(key)
      .then(() => !cancelled && setVerified(true))
      .catch((e) => {
        if (cancelled) return
        const code = e instanceof ApiError ? e.code : 'network_error'
        setError(GATE_ERRORS[code] ?? code)
        if (code === 'invalid_admin_key') {
          saveAdminKey(null)
          setKey(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [key])

  function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    saveAdminKey(draft.trim())
    setKey(draft.trim())
  }

  return (
    <PageShell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-[22px] font-bold">{title}</h1>
        {verified && (
          <button
            type="button"
            onClick={() => {
              saveAdminKey(null)
              setKey(null)
              setVerified(false)
            }}
            className="min-h-11 rounded-[12px] px-2 text-[13px] font-semibold text-text-muted hover:bg-surface-2"
          >
            Lock
          </button>
        )}
      </div>
      <nav aria-label="Admin" className="mt-3 grid grid-cols-3 gap-1 rounded-[14px] bg-surface-2 p-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `flex min-h-11 items-center justify-center rounded-[10px] text-[15px] font-semibold ${
                isActive ? 'bg-surface text-text shadow-[var(--shadow-card)]' : 'text-text-2'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4">
        {key && verified ? (
          children(key)
        ) : key && !error ? (
          <p className="text-[15px] text-text-muted">Checking key…</p>
        ) : (
          <form onSubmit={submit} className="rounded-[20px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-green-tint text-green-text">
              <KeyRound aria-hidden size={22} />
            </span>
            <p className="mt-3 text-[15px] text-text-2">Test hub for the team. Enter the admin key from .env (asked once on this device).</p>
            <label className="mt-3 block text-[13px] text-text-2">
              Admin key
              <input
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="mt-1 block h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3 text-[16px] focus:border-blue focus:outline-none"
              />
            </label>
            {error && <p role="alert" className="mt-2 text-[13px] font-medium text-red-text">{error}</p>}
            <Button type="submit" size="md" className="mt-3" disabled={!draft.trim()}>
              Unlock
            </Button>
          </form>
        )}
      </div>
    </PageShell>
  )
}
