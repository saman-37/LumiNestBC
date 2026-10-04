import { Lock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { PageShell } from '../components/PageShell'
import { ActivityList } from '../components/staff/ActivityList'
import { CountPanel } from '../components/staff/CountPanel'
import { HoldsList } from '../components/staff/HoldsList'
import { SettingsPanel } from '../components/staff/SettingsPanel'
import { TagsPanel } from '../components/staff/TagsPanel'
import { FreshnessPill, Skeleton } from '../components/Status'
import { useToast } from '../components/Toast'
import { api, ApiError, staffApi, type StaffAuth } from '../lib/api'
import { bedsWord } from '../lib/filters'
import { captureStaffKeyFromUrl, forgetStaffKey, getAdminKey, getStaffKey } from '../lib/keys'
import { useShelterUpdates } from '../lib/socket'
import type { Shelter, StaffChange, StaffDetail, TagAction } from '../lib/types'

// The private staff portal. Access is the link from the coordinator:
// /staff/<shelter>#key=<key>. The key moves into localStorage and leaves the address bar.

function initialAuth(shelterId: string): StaffAuth | null {
  const key = captureStaffKeyFromUrl(shelterId) ?? getStaffKey(shelterId)
  if (key) return { staffKey: key }
  const admin = getAdminKey() // the admin hub can open any portal while dev tools are on
  return admin ? { adminKey: admin } : null
}

const ERRORS: Record<string, string> = {
  rate_limited: 'Too many changes in a minute. Wait a moment and try again.',
  at_capacity: "That's already every bed. Raise the capacity in settings first.",
  invalid_count: "That number doesn't fit this shelter's capacity.",
  already_reverted: 'That change was already reverted.',
  revert_window_passed: 'Too late to revert that one (over an hour ago).',
  invalid_phone: 'Enter a 10-digit phone number, like 604-555-0101.',
  phone_in_use: 'Another shelter already uses that phone number.',
  hold_not_active: 'That hold already ended.',
  network_error: "Can't reach LuminestBC. Check your connection.",
}

function Locked({ shelterId, invalid }: { shelterId: string; invalid: boolean }) {
  const [shelter, setShelter] = useState<Shelter | null>(null)
  useEffect(() => {
    api.shelter(shelterId).then(setShelter).catch(() => setShelter(null))
  }, [shelterId])
  return (
    <PageShell>
      <div className="mt-6 rounded-[20px] border border-border bg-surface p-6 text-center shadow-[var(--shadow-card)]">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-tint text-green-text">
          <Lock aria-hidden size={26} />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-bold">
          {invalid ? 'This link has expired' : `This page is for ${shelter?.name ?? 'shelter'} staff.`}
        </h1>
        <p className="mt-2 text-[15px] text-text-2">
          {invalid ? 'Ask your coordinator for a new private staff link.' : 'Open the private link from your coordinator.'}
        </p>
      </div>
    </PageShell>
  )
}

export default function StaffPage() {
  const { shelterId = '' } = useParams()
  const toast = useToast()
  const [auth, setAuth] = useState<StaffAuth | null>(() => initialAuth(shelterId))
  const [detail, setDetail] = useState<StaffDetail | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid' | 'not_found' | 'error'>('loading')
  const [busy, setBusy] = useState(false)
  const refreshTimer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    if (!auth) return
    try {
      setDetail(await staffApi.detail(shelterId, auth))
      setStatus('ready')
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        if ('staffKey' in auth) forgetStaffKey(shelterId)
        setAuth(null)
        setStatus('invalid')
      } else if (e instanceof ApiError && e.status === 404) setStatus('not_found')
      else if (!(e instanceof ApiError && e.code === 'rate_limited')) setStatus('error')
    }
  }, [auth, shelterId])

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000) // keeps "last tapped" and countdowns honest
    return () => clearInterval(timer)
  }, [load])

  /** Refetch events/holds shortly after a change (batched so bursts don't hit the rate limit). */
  const scheduleRefresh = useCallback(
    (ms = 800) => {
      window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(load, ms)
    },
    [load],
  )
  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])

  useShelterUpdates((s) => {
    if (s.id !== shelterId) return
    setDetail((d) => (d ? { ...d, shelter: s } : d))
    scheduleRefresh()
  })

  async function run(action: () => Promise<StaffChange>, message: (r: StaffChange) => string, undoable = true) {
    if (!auth) return
    setBusy(true)
    try {
      const res = await action()
      setDetail((d) => (d ? { ...d, shelter: res.shelter } : d))
      const undo =
        undoable && res.delta !== 0
          ? { label: 'Undo', onClick: () => run(() => staffApi.revert(shelterId, auth, res.event_id), () => 'Change undone', false) }
          : undefined
      toast(message(res), 'success', undo)
      scheduleRefresh(300)
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'network_error'
      toast(ERRORS[code] ?? `Something went wrong (${code}).`, 'error')
      if (e instanceof ApiError && e.status === 403) load()
    } finally {
      setBusy(false)
    }
  }

  async function rotate(action: TagAction) {
    if (!auth) return null
    setBusy(true)
    try {
      const res = await staffApi.rotateTag(shelterId, auth, action)
      setDetail((d) => (d ? { ...d, tags: res.tags } : d))
      toast('New tag link ready. The old tag no longer works.', 'success')
      return res.tags
    } catch (e) {
      toast(ERRORS[e instanceof ApiError ? e.code : 'network_error'] ?? "Couldn't make a new link.", 'error')
      return null
    } finally {
      setBusy(false)
    }
  }

  if (!auth || status === 'invalid') return <Locked shelterId={shelterId} invalid={status === 'invalid'} />

  if (!detail)
    return (
      <PageShell>
        {status === 'not_found' || status === 'error' ? (
          <p className="text-[15px] text-text-2">{status === 'not_found' ? 'Shelter not found.' : "Can't load this shelter."}</p>
        ) : (
          <div className="grid gap-4" aria-busy="true">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-[280px] w-full rounded-[20px]" />
            <Skeleton className="h-24 w-full rounded-[20px]" />
          </div>
        )}
      </PageShell>
    )

  const { shelter } = detail
  const beds = (n: number) => `${n} ${bedsWord(n)} open`

  return (
    <PageShell>
      <p className="text-[13px] uppercase tracking-wide text-text-muted">Staff view{'adminKey' in auth ? ' · admin' : ''}</p>
      <div className="mt-0.5 flex items-start justify-between gap-3">
        <h1 className="min-w-0 break-words font-display text-[22px] font-bold leading-tight">{shelter.name}</h1>
        <FreshnessPill freshness={shelter.freshness} />
      </div>

      <div className="mt-4 grid gap-4">
        <CountPanel
          shelter={shelter}
          busy={busy}
          onAdjust={(delta) =>
            run(() => staffApi.adjust(shelterId, auth, delta), (r) => `${delta > 0 ? '+1' : '−1'} · now ${beds(r.open_beds)}`)
          }
          onSetCount={(n) => run(() => staffApi.setCount(shelterId, auth, n), (r) => `Count set · ${beds(r.open_beds)}`)}
          onFull={() => run(() => staffApi.markFull(shelterId, auth), () => 'Marked full')}
          onReopen={(n) => run(() => staffApi.reopen(shelterId, auth, n), (r) => `Reopened · ${beds(r.open_beds)}`)}
        />
        <HoldsList
          holds={detail.holds}
          busy={busy}
          onRelease={(h) => run(() => staffApi.releaseHold(shelterId, auth, h.id), () => `Released ${h.worker_name}'s hold`, false)}
        />
        <ActivityList
          events={detail.events}
          openBeds={shelter.open_beds}
          windowMinutes={detail.revert_window_minutes}
          busy={busy}
          onRevert={(e) => run(() => staffApi.revert(shelterId, auth, e.id), (r) => `Reverted · ${beds(r.open_beds)}`, false)}
        />
        <SettingsPanel
          shelter={shelter}
          busy={busy}
          onSave={(s) => run(() => staffApi.settings(shelterId, auth, s), () => 'Settings saved', false)}
        />
        <TagsPanel shelterName={shelter.name} tags={detail.tags} busy={busy} onRotate={rotate} />
      </div>
    </PageShell>
  )
}
