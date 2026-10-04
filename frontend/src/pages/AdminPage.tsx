import { ExternalLink, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AdminShell } from '../components/admin/AdminShell'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { Button } from '../components/Button'
import { FreshnessPill } from '../components/Status'
import { useToast } from '../components/Toast'
import { adminApi, ApiError } from '../lib/api'
import { useShelterStore } from '../lib/shelterStore'
import type { AdminShelter, TagAction } from '../lib/types'

const TAG_BUTTONS: Record<TagAction, string> = { freed: '+1', filled: '−1', full: 'Full', arrive: 'Arrive' }

/** Every shelter with its live count, staff portal and tag links: test any flow from one laptop. */
function ShelterHub({ adminKey }: { adminKey: string }) {
  const toast = useToast()
  const { shelters: live } = useShelterStore()
  const [shelters, setShelters] = useState<AdminShelter[]>([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    adminApi.shelters(adminKey).then(setShelters).catch(() => toast("Couldn't load shelters", 'error'))
  }, [adminKey, toast])
  useEffect(load, [load])

  async function act(label: string, fn: () => Promise<unknown>, message: (r: never) => string) {
    setBusy(true)
    try {
      const res = await fn()
      toast(message(res as never), 'success')
      load()
    } catch (e) {
      toast(`${label} failed (${e instanceof ApiError ? e.code : 'network_error'})`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const liveById = new Map(live.map((s) => [s.id, s]))

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="md"
          disabled={busy}
          onClick={() =>
            act('Reset', () => adminApi.resetDemo(adminKey), (r: { shelters: number; holds_cancelled: number }) =>
              `Demo reset: ${r.shelters} shelters, ${r.holds_cancelled} holds cancelled`)
          }
        >
          Reset demo data
        </Button>
        <Button
          variant="outline"
          size="md"
          disabled={busy}
          onClick={() => act('Expire', () => adminApi.expireHolds(adminKey), (r: { expired: number }) => `${r.expired} hold(s) expired`)}
        >
          Expire all holds
        </Button>
      </div>

      <ul className="mt-4 grid gap-3">
        {shelters.map((s) => {
          const now = liveById.get(s.id) ?? s
          return (
            <li key={s.id} className="rounded-[16px] border border-border bg-surface p-3.5 shadow-[var(--shadow-card)]">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[16px] font-bold leading-snug">
                    {s.is_dv && <ShieldCheck aria-label="Confidential DV shelter" size={16} className="mr-1 inline text-blue" />}
                    {s.name}
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {s.id}
                    {!now.accepting && ' · not accepting'}
                    {!s.has_staff_key && ' · no staff key yet'}
                  </p>
                  <div className="mt-1.5">
                    <FreshnessPill freshness={now.freshness} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <AnimatedNumber value={now.open_beds} className="block font-display text-[30px] font-bold leading-none text-green-text" />
                  <span className="text-[13px] text-text-muted">open</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Tag links (each one really taps)">
                {s.tags.map((t) =>
                  t.path ? (
                    <a
                      key={t.action}
                      href={t.path}
                      target="_blank"
                      rel="noreferrer"
                      title={t.label}
                      className="flex min-h-11 items-center justify-center rounded-[12px] border border-border-strong text-[15px] font-semibold hover:bg-surface-2"
                    >
                      {TAG_BUTTONS[t.action]}
                    </a>
                  ) : (
                    <span key={t.action} className="flex min-h-11 items-center justify-center rounded-[12px] border border-dashed border-border text-[13px] text-text-muted">
                      no tag
                    </span>
                  ),
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Link
                  to={`/staff/${s.id}`}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-green-tint text-[15px] font-semibold text-green-text"
                >
                  Staff portal <ExternalLink aria-hidden size={16} />
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act('Make stale', () => adminApi.makeStale(adminKey, s.id), () => `${s.name} now looks 4 h old`)}
                  className="min-h-11 rounded-[12px] border border-border-strong text-[15px] font-semibold hover:bg-surface-2 disabled:opacity-50"
                >
                  Make stale
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 text-[13px] text-text-muted">
        Tag buttons open the real tag page in a new tab, so each click is a real tap. Shelters without tags: run
        scripts/generate_tag_links.py or use "Set up" in the staff portal.
      </p>
    </>
  )
}

export default function AdminPage() {
  return <AdminShell title="Test hub">{(key) => <ShelterHub adminKey={key} />}</AdminShell>
}
