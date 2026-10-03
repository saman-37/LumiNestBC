import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Button } from '../components/Button'
import { PageShell } from '../components/PageShell'
import { api, ApiError } from '../lib/api'
import { minutesUntil, newTapId, useNow } from '../lib/format'
import type { Hold, TagAction, TapResponse } from '../lib/types'

// Every NFC tag opens this page: /t/<shelterId>/<action>?k=<secret>.
// Opening the URL changes nothing by itself; only the POST below does. That way link
// previews and prefetching can't cause phantom taps.

const ACTIONS: TagAction[] = ['freed', 'filled', 'full', 'arrive']
const TITLES: Record<TagAction, string> = {
  freed: 'Bed freed',
  filled: 'Bed filled',
  full: "We're full",
  arrive: 'Arrival',
}

type State =
  | { kind: 'sending' }
  | { kind: 'done'; res: TapResponse; at: number }
  | { kind: 'error'; message: string; retry: boolean }

function changeText(res: TapResponse): string {
  const delta = res.delta ?? 0
  if (res.status === 'duplicate') return 'Already counted. This tap was received before.'
  if (res.status === 'ignored_cooldown') return 'Tapped twice: counted once. Wait 5 seconds between taps.'
  if (res.action === 'freed') return '+1 bed freed'
  if (res.action === 'filled') return delta === 0 ? 'Already at 0, nothing to remove' : '−1 bed filled'
  return delta === 0 ? 'Already marked full' : `Marked full (was ${-delta})`
}

function errorText(e: unknown): { message: string; retry: boolean } {
  if (e instanceof ApiError && e.code === 'invalid_tag')
    return { message: "This tag isn't recognised. Ask your LuminestBC contact for a new one.", retry: false }
  if (e instanceof ApiError && e.status > 0) return { message: `Something went wrong (${e.code}).`, retry: true }
  return { message: "Couldn't reach LuminestBC. Check your connection.", retry: true }
}

export default function TapPage() {
  const { shelterId = '', action = '' } = useParams()
  const [params] = useSearchParams()
  const k = params.get('k') ?? ''
  const tapId = useRef<string | null>(null) // one tap_id per page load; retries reuse it (server dedupes)
  const [state, setState] = useState<State>({ kind: 'sending' })
  const [undo, setUndo] = useState<{ status: 'idle' | 'busy' | 'done' | 'failed'; count?: number }>({ status: 'idle' })
  const [confirming, setConfirming] = useState<string | null>(null)
  const now = useNow(250)
  const validAction = (ACTIONS as string[]).includes(action) ? (action as TagAction) : null

  const send = useCallback(() => {
    if (!validAction || !tapId.current) return
    setState({ kind: 'sending' })
    api
      .tap(shelterId, validAction, k, tapId.current)
      .then((res) => setState({ kind: 'done', res, at: Date.now() }))
      .catch((e) => setState({ kind: 'error', ...errorText(e) }))
  }, [shelterId, validAction, k])

  useEffect(() => {
    if (tapId.current) return // StrictMode runs effects twice in dev; POST only once
    if (!validAction) return setState({ kind: 'error', message: 'This tag link is not valid.', retry: false })
    if (!k) return setState({ kind: 'error', message: 'This tag link is missing its key.', retry: false })
    tapId.current = newTapId()
    send()
  }, [validAction, k, send])

  async function doUndo() {
    if (!tapId.current) return
    setUndo({ status: 'busy' })
    try {
      const res = await api.undo(tapId.current)
      setUndo({ status: 'done', count: res.open_beds })
    } catch {
      setUndo({ status: 'failed' })
    }
  }

  async function confirmHold(hold: Hold) {
    setConfirming(hold.id)
    try {
      const res = await api.arriveHold(hold.id)
      if (state.kind === 'done')
        setState({ kind: 'done', at: state.at, res: { ...state.res, status: 'arrived', hold: res.hold } })
    } catch {
      setConfirming(null)
    }
  }

  return (
    <PageShell>
      <p className="text-sm font-semibold uppercase tracking-wide text-light">{validAction ? TITLES[validAction] : 'Tag'}</p>

      {state.kind === 'sending' && <p className="mt-6 text-2xl text-muted">Updating…</p>}

      {state.kind === 'error' && (
        <div className="mt-6 grid gap-4">
          <p role="alert" className="text-xl">{state.message}</p>
          {state.retry && <Button onClick={send}>Try again</Button>}
        </div>
      )}

      {state.kind === 'done' && (
        <>
          <h1 className="mt-1 break-words text-2xl font-bold leading-tight">{state.res.shelter.name}</h1>

          {validAction === 'arrive' ? (
            <ArrivalResult res={state.res} confirming={confirming} onConfirm={confirmHold} now={now} />
          ) : (
            <BedResult
              res={state.res}
              undo={undo}
              secondsLeft={Math.ceil((state.at + (state.res.undo_seconds ?? 10) * 1000 - now) / 1000)}
              onUndo={doUndo}
            />
          )}

          <Link to={`/staff/${shelterId}`} className="mt-8 flex min-h-14 items-center justify-center rounded-2xl text-muted underline">
            Open shelter dashboard
          </Link>
        </>
      )}
    </PageShell>
  )
}

function BedResult({ res, undo, secondsLeft, onUndo }: {
  res: TapResponse
  undo: { status: string; count?: number }
  secondsLeft: number
  onUndo: () => void
}) {
  const count = undo.status === 'done' && undo.count !== undefined ? undo.count : res.open_beds
  const canUndo = res.status === 'applied' && (res.delta ?? 0) !== 0
  return (
    <>
      <p className={`mt-6 text-center text-[9rem] font-extrabold leading-none tabular-nums ${count > 0 ? 'text-light' : 'text-ink'}`} aria-live="polite">
        {count}
      </p>
      <p className="text-center text-xl text-muted">{count === 1 ? 'open bed' : 'open beds'}</p>
      <p className="mt-6 text-center text-xl font-semibold">{undo.status === 'done' ? 'Undone.' : changeText(res)}</p>

      <div className="mt-6">
        {canUndo && undo.status !== 'done' && secondsLeft > 0 && (
          <Button variant="secondary" onClick={onUndo} disabled={undo.status === 'busy'}>
            Undo ({secondsLeft})
          </Button>
        )}
        {undo.status === 'failed' && <p role="alert" className="mt-3 text-center text-stale">Couldn't undo. The window may have passed.</p>}
      </div>
    </>
  )
}

function ArrivalResult({ res, confirming, onConfirm, now }: {
  res: TapResponse
  confirming: string | null
  onConfirm: (hold: Hold) => void
  now: number
}) {
  if (res.status === 'arrived' && res.hold)
    return (
      <div className="mt-8 text-center">
        <p className="text-3xl font-bold text-fresh">Arrival confirmed</p>
        <p className="mt-3 text-lg">
          Hold for {res.hold.worker_name} ({res.hold.worker_org})
        </p>
      </div>
    )
  if (res.status === 'choose_hold' && res.holds)
    return (
      <div className="mt-6 grid gap-3">
        <p className="text-lg">Several holds are waiting. Which one arrived?</p>
        {res.holds.map((hold) => (
          <Button key={hold.id} variant="secondary" onClick={() => onConfirm(hold)} disabled={confirming !== null} className="h-auto flex-col py-3">
            <span>{hold.worker_name} · {hold.worker_org}</span>
            <span className="text-sm font-normal text-muted">expires in {minutesUntil(hold.expires_at, now)} min</span>
          </Button>
        ))}
      </div>
    )
  if (res.status === 'no_active_holds') return <p className="mt-6 text-xl">No active holds at this shelter right now.</p>
  return <p className="mt-6 text-xl">{changeText(res)}</p>
}
