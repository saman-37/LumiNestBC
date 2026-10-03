import { Navigation, Phone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Button, LinkButton } from '../components/Button'
import { PageShell } from '../components/PageShell'
import { api, ApiError } from '../lib/api'
import { formatCountdown, useNow } from '../lib/format'
import { useShelterUpdates } from '../lib/socket'
import type { HoldWithShelter } from '../lib/types'

function directionsUrl({ shelter }: HoldWithShelter): string | null {
  if (shelter.lat !== null && shelter.lng !== null)
    return `https://www.google.com/maps/dir/?api=1&destination=${shelter.lat},${shelter.lng}`
  if (shelter.address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(shelter.address)}`
  return null
}

export default function HoldPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const now = useNow(1000)
  const [data, setData] = useState<HoldWithShelter | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

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
    if (s.id === data?.shelter.id) load() // arrival / expiry show up without a refresh
  })

  async function cancel() {
    if (!window.confirm('Cancel this hold and give the bed back?')) return
    setCancelling(true)
    try {
      await api.cancelHold(id)
      navigate('/')
    } catch {
      setError("Couldn't cancel. Try again.")
      setCancelling(false)
    }
  }

  if (!data) {
    return (
      <PageShell>
        <p className="text-lg text-muted">{error ?? 'Loading hold…'}</p>
      </PageShell>
    )
  }

  const { hold, shelter } = data
  const msLeft = Date.parse(hold.expires_at) - now
  const status = hold.status === 'active' && msLeft <= 0 ? 'expired' : hold.status
  const directions = directionsUrl(data)
  const phone = shelter.is_dv ? shelter.dv_phone : shelter.staff_phone

  return (
    <PageShell>
      <p className="text-muted">Bed held at</p>
      <h1 className="break-words text-2xl font-bold leading-tight">{shelter.name}</h1>

      {status === 'active' && (
        <>
          <p className="mt-8 text-center text-8xl font-extrabold tabular-nums text-light" role="timer" aria-label="Time left on hold">
            {formatCountdown(msLeft)}
          </p>
          <p className="mt-3 text-center text-muted">
            Held for {hold.worker_name} ({hold.worker_org}). Tap the Arrival tag by the door when you get there.
          </p>
        </>
      )}
      {status === 'arrived' && <p className="mt-8 text-center text-3xl font-bold text-fresh">Arrival confirmed</p>}
      {status === 'expired' && <p className="mt-8 text-center text-3xl font-bold text-stale">This hold expired</p>}
      {status === 'cancelled' && <p className="mt-8 text-center text-3xl font-bold text-muted">Hold cancelled</p>}

      <div className="mt-8 rounded-2xl bg-surface p-4">
        <p className="text-sm text-muted">Address</p>
        <p className="break-words text-lg">{shelter.address ?? 'Confidential location: call for directions'}</p>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-stale/50 bg-stale/10 p-3">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-3">
        {directions && status === 'active' && (
          <LinkButton href={directions} target="_blank" rel="noreferrer">
            <Navigation aria-hidden size={20} /> Directions
          </LinkButton>
        )}
        {phone && (
          <LinkButton variant="secondary" href={`tel:${phone}`}>
            <Phone aria-hidden size={20} /> Call {phone}
          </LinkButton>
        )}
        {status === 'active' ? (
          <Button variant="danger" onClick={cancel} disabled={cancelling}>
            {cancelling ? 'Cancelling…' : 'Cancel hold'}
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => navigate('/')}>
            Back to map
          </Button>
        )}
      </div>
    </PageShell>
  )
}
