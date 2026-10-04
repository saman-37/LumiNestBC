import { ChevronLeft, Navigation, Phone } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button, LinkButton } from '../components/Button'
import { CheckDraw } from '../components/CheckDraw'
import { CountdownRing, Steps, type StepState } from '../components/HoldParts'
import { PageShell } from '../components/PageShell'
import { directionsUrl } from '../components/ShelterDetailView'
import { Skeleton } from '../components/Status'
import { useToast } from '../components/Toast'
import { api, ApiError } from '../lib/api'
import { formatClock, formatCountdown, formatPhone, telHref, useNow } from '../lib/format'
import { useShelterUpdates } from '../lib/socket'
import type { HoldWithShelter } from '../lib/types'

function ringColor(msLeft: number): string {
  if (msLeft < 3 * 60_000) return 'var(--red)'
  if (msLeft < 10 * 60_000) return 'var(--amber)'
  return 'var(--green)'
}

export default function HoldPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const now = useNow(1000)
  const [data, setData] = useState<HoldWithShelter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [releasing, setReleasing] = useState(false)

  const load = useCallback(() => {
    api
      .hold(id)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'Hold not found.' : "Can't reach LuminestBC."))
  }, [id])

  useEffect(load, [load])
  useShelterUpdates((s) => {
    if (s.id === data?.shelter.id) load() // arrival / expiry show up live
  })

  async function release() {
    setReleasing(true)
    try {
      await api.cancelHold(id)
      toast('Hold released. The bed is back in the pool.', 'success')
      navigate('/')
    } catch {
      toast("Couldn't release the hold. Try again.", 'error')
      setReleasing(false)
    }
  }

  const back = (
    <button
      type="button"
      onClick={() => navigate('/')}
      aria-label="Back to map"
      className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border bg-surface text-text shadow-[var(--shadow-card)]"
    >
      <ChevronLeft aria-hidden size={22} />
    </button>
  )

  if (!data)
    return (
      <PageShell>
        <div className="flex items-center gap-3">
          {back}
          {error ? <p className="text-[15px] text-text-3">{error}</p> : <Skeleton className="h-6 flex-1" />}
        </div>
        {!error && <Skeleton className="mt-4 h-[320px] w-full rounded-[20px]" />}
      </PageShell>
    )

  const { hold, shelter } = data
  const total = Date.parse(hold.expires_at) - Date.parse(hold.created_at)
  const msLeft = Date.parse(hold.expires_at) - now
  const status = hold.status === 'active' && msLeft <= 0 ? 'expired' : hold.status
  const directions = directionsUrl(shelter)
  const phone = shelter.is_dv ? shelter.dv_phone : shelter.public_phone
  const arrived = status === 'arrived'

  const steps: { label: string; detail?: string; state: StepState }[] = [
    { label: 'Hold placed', detail: formatClock(hold.created_at), state: 'done' },
    { label: 'Travelling to shelter', state: arrived ? 'done' : 'current' },
    { label: 'Shelter confirms arrival', detail: arrived ? 'Confirmed by shelter staff' : 'Staff confirm it when you get there', state: arrived ? 'done' : 'upcoming' },
  ]

  return (
    <PageShell>
      <div className="flex items-center gap-3">
        {back}
        <div className="min-w-0">
          <h1 className="break-words font-display text-[20px] font-bold leading-tight">{shelter.name}</h1>
          <p className="text-[13px] text-text-muted">Your hold · {hold.worker_org}</p>
        </div>
      </div>

      <section className="mt-4 rounded-[20px] border border-border bg-surface p-5 text-center shadow-[var(--shadow-card)]" aria-live="polite">
        <CountdownRing
          progress={status === 'active' ? msLeft / total : arrived ? 1 : 0}
          color={arrived ? 'var(--green)' : status === 'active' ? ringColor(msLeft) : 'var(--border-strong)'}
        >
          <AnimatePresence mode="wait" initial={false}>
            {arrived ? (
              <motion.div key="arrived" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex flex-col items-center">
                <CheckDraw size={56} />
                <span className="font-display text-[24px] font-bold text-green-text">Arrived</span>
              </motion.div>
            ) : (
              <motion.div key="time" exit={{ opacity: 0 }}>
                <span role="timer" className="tabular block font-display text-[40px] font-bold tracking-[-0.02em] leading-none">
                  {formatCountdown(status === 'active' ? Math.min(msLeft, total) : 0)}
                </span>
                <span className="mt-1.5 block text-[13px] text-text-muted">
                  {status === 'active' ? 'left on hold' : status === 'expired' ? 'hold expired' : 'hold released'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </CountdownRing>

        {status === 'active' && (
          <>
            <p className="mt-4 font-display text-[20px] font-bold">1 bed held for you</p>
            <p className="mt-1 text-[15px] text-text-3">
              Held under outreach worker {hold.worker_name}. No details about the person are stored.
            </p>
          </>
        )}
        {arrived && (
          <>
            <p className="mt-4 font-display text-[20px] font-bold">Arrival confirmed</p>
            <p className="mt-1 text-[15px] text-text-3">Shelter staff confirmed the arrival. Welcome in.</p>
          </>
        )}
        {(status === 'expired' || status === 'cancelled') && (
          <>
            <p className="mt-4 font-display text-[20px] font-bold">
              {status === 'expired' ? 'Hold expired, the bed went back to the pool' : 'Hold released. The bed is back in the pool.'}
            </p>
            <Button className="mt-4" onClick={() => navigate('/')}>
              Find another bed
            </Button>
          </>
        )}
      </section>

      {(status === 'active' || arrived) && (
        <section className="mt-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
          <Steps steps={steps} />
        </section>
      )}

      <section className="mt-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <p className="text-[13px] font-normal uppercase tracking-wide text-text-muted">Address</p>
        <p className="mt-1 break-words text-[15px]">{shelter.address ?? 'Confidential location: call for directions'}</p>
        {phone && (
          <a href={telHref(phone)} className="mt-2 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-blue-light">
            <Phone aria-hidden size={18} /> Call {formatPhone(phone)}
          </a>
        )}
      </section>

      {status === 'active' && (
        <div className="mt-5 grid gap-2.5">
          {directions && (
            <LinkButton href={directions} target="_blank" rel="noreferrer">
              <Navigation aria-hidden size={20} /> Get directions
            </LinkButton>
          )}
          {confirmRelease ? (
            <div className="rounded-[12px] border border-border-strong bg-surface p-3">
              <p className="text-center text-[15px] font-medium">Release this hold? The bed goes back to the pool.</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <Button variant="outline" size="md" onClick={() => setConfirmRelease(false)}>
                  Keep hold
                </Button>
                <Button variant="danger" size="md" onClick={release} disabled={releasing}>
                  {releasing ? 'Releasing…' : 'Release'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="md" onClick={() => setConfirmRelease(true)}>
              Release hold
            </Button>
          )}
        </div>
      )}
    </PageShell>
  )
}
