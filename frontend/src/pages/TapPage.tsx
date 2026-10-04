import { CircleAlert, Undo2, Users, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { Button } from '../components/Button'
import { CheckDraw } from '../components/CheckDraw'
import { PageShell } from '../components/PageShell'
import { api, ApiError } from '../lib/api'
import { vibrate } from '../lib/device'
import { bedsWord } from '../lib/filters'
import { minutesUntil, newTapId, useNow } from '../lib/format'
import type { Hold, TagAction, TapResponse } from '../lib/types'

// Every NFC tag opens this page: /t/<shelterId>/<action>?k=<secret>.
// Opening the URL changes nothing by itself; only the POST below does, so link previews
// and prefetching can't cause phantom taps.

const ACTIONS: TagAction[] = ['freed', 'filled', 'full', 'arrive']
const TITLES: Record<Exclude<TagAction, 'arrive'>, string> = {
  freed: 'Bed freed',
  filled: 'Bed filled',
  full: 'Marked full',
}

type State =
  | { kind: 'sending' }
  | { kind: 'done'; res: TapResponse; at: number }
  | { kind: 'error'; invalid: boolean }

type Undo = { status: 'idle' | 'busy' | 'failed' } | { status: 'done'; count: number }
type Tone = 'loading' | 'green' | 'muted' | 'red' | 'blue'

const TONES: Record<Tone, string> = {
  loading: 'pulse-ring border-green bg-green-tint',
  green: 'border-green-strong bg-green-tint',
  muted: 'border-border-strong bg-surface-2',
  red: 'border-red bg-red-tint',
  blue: 'border-blue bg-blue-tint',
}

function StatusCircle({ tone, children }: { tone: Tone; children?: ReactNode }) {
  return (
    <motion.div
      key={tone}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className={`grid h-[120px] w-[120px] place-items-center rounded-full border-2 ${TONES[tone]}`}
    >
      {children}
    </motion.div>
  )
}

function LiveForWorkers() {
  return (
    <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-green-tint-border bg-green-tint px-3 py-1.5 text-[13px] font-semibold text-green-text">
      <span aria-hidden className="h-2 w-2 rounded-full bg-green" /> Live for outreach workers
    </span>
  )
}

function Beds({ from, value }: { from?: number; value: number }) {
  return (
    <strong className="text-green-text">
      <AnimatedNumber from={from} value={value} /> {bedsWord(value)} open
    </strong>
  )
}

export default function TapPage() {
  const { shelterId = '', action = '' } = useParams()
  const [params] = useSearchParams()
  const k = params.get('k') ?? ''
  const tapId = useRef<string | null>(null) // one tap_id per page load; retries reuse it (server dedupes)
  const [state, setState] = useState<State>({ kind: 'sending' })
  const [undo, setUndo] = useState<Undo>({ status: 'idle' })
  const [confirming, setConfirming] = useState<string | null>(null)
  const now = useNow(250)
  const validAction = (ACTIONS as string[]).includes(action) ? (action as TagAction) : null

  const send = useCallback(() => {
    if (!validAction || !tapId.current) return
    setState({ kind: 'sending' })
    api
      .tap(shelterId, validAction, k, tapId.current)
      .then((res) => {
        if ((res.status === 'applied' && res.delta) || res.status === 'arrived') vibrate(200)
        setState({ kind: 'done', res, at: Date.now() })
      })
      .catch((e) => setState({ kind: 'error', invalid: e instanceof ApiError && e.code === 'invalid_tag' }))
  }, [shelterId, validAction, k])

  useEffect(() => {
    if (tapId.current) return // StrictMode runs effects twice in dev; POST only once
    if (!validAction || !k) return setState({ kind: 'error', invalid: true })
    tapId.current = newTapId()
    send()
  }, [validAction, k, send])

  async function doUndo() {
    if (!tapId.current) return
    setUndo({ status: 'busy' })
    try {
      const res = await api.undo(tapId.current)
      setUndo(res.open_beds === undefined ? { status: 'failed' } : { status: 'done', count: res.open_beds })
    } catch {
      setUndo({ status: 'failed' })
    }
  }

  async function confirmHold(hold: Hold) {
    setConfirming(hold.id)
    try {
      const res = await api.arriveHold(hold.id)
      vibrate(200)
      if (state.kind === 'done') setState({ ...state, res: { ...state.res, status: 'arrived', hold: res.hold } })
    } catch {
      setConfirming(null)
    }
  }

  // ---- what to show ----
  let tone: Tone = 'loading'
  let icon: ReactNode = null
  let title = 'Updating…'
  let sentence: ReactNode = null
  let live = false
  let extra: ReactNode = null
  const name = state.kind === 'done' ? state.res.shelter.name : null

  if (state.kind === 'error') {
    tone = 'red'
    icon = state.invalid ? <X aria-hidden size={56} className="text-red-text" /> : <CircleAlert aria-hidden size={52} className="text-red-text" />
    title = state.invalid ? 'Tag not recognised' : "Couldn't reach LuminestBC"
    sentence = state.invalid ? 'It may have been replaced. Ask your coordinator for the new link.' : 'Check your connection, then try again.'
    if (!state.invalid)
      extra = (
        <Button onClick={send} className="mt-8">
          Retry
        </Button>
      )
  } else if (state.kind === 'done') {
    const { res } = state
    const beds = res.open_beds
    if (res.status === 'duplicate' || res.status === 'ignored_cooldown') {
      tone = 'muted'
      icon = <CheckDraw size={60} color="var(--text-muted)" />
      title = 'Already counted'
      sentence = (
        <>
          {name} shows <strong className="text-text">{beds} {bedsWord(beds)} open</strong>. Only the first tap counts.
        </>
      )
    } else if (res.status === 'applied' && undo.status === 'done') {
      tone = 'green'
      icon = <Undo2 aria-hidden size={52} className="text-green-strong" />
      title = 'Undone'
      sentence = (
        <>
          {name} is back to <Beds from={beds} value={undo.count} />.
        </>
      )
      live = true
    } else if (res.status === 'applied') {
      const delta = res.delta ?? 0
      tone = delta ? 'green' : 'muted'
      icon = <CheckDraw size={64} color={delta ? 'var(--green-strong)' : 'var(--text-muted)'} />
      title = delta ? TITLES[res.action as keyof typeof TITLES] : 'No change needed'
      sentence = delta ? (
        <>
          {name} now shows <Beds from={beds - delta} value={beds} />.
        </>
      ) : (
        <>
          {name} already shows <strong className="text-text">{beds} {bedsWord(beds)} open</strong>.
        </>
      )
      live = delta !== 0
      const secondsLeft = Math.ceil((state.at + (res.undo_seconds ?? 10) * 1000 - now) / 1000)
      if (delta && secondsLeft > 0 && undo.status !== 'failed')
        extra = (
          <div className="mt-10">
            <button
              type="button"
              onClick={doUndo}
              disabled={undo.status === 'busy'}
              className="relative flex min-h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-border bg-surface text-[16px] font-semibold text-text shadow-[var(--shadow-card)] disabled:opacity-60"
            >
              <Undo2 aria-hidden size={20} />
              {undo.status === 'busy' ? 'Undoing…' : `Undo (${secondsLeft} s)`}
              <span
                aria-hidden
                className="drain absolute bottom-0 left-0 h-[3px] w-full bg-green-strong"
                style={{ animationDuration: `${res.undo_seconds ?? 10}s` }}
              />
            </button>
            <p className="mt-3 text-center text-[13px] text-text-muted">Tapped by mistake? Undo, or just close this page.</p>
          </div>
        )
      if (undo.status === 'failed')
        extra = <p className="mt-8 text-center text-[15px] font-medium text-red-text">Couldn't undo. The 10 second window may have passed.</p>
    } else if (res.status === 'arrived' && res.hold) {
      tone = 'green'
      icon = <CheckDraw size={64} />
      title = 'Welcome in'
      sentence = (
        <>
          Hold for <strong className="text-text">{res.hold.worker_name}</strong> ({res.hold.worker_org}) confirmed.
        </>
      )
      live = true
    } else if (res.status === 'choose_hold' && res.holds) {
      tone = 'blue'
      icon = <Users aria-hidden size={52} className="text-blue" />
      title = 'Welcome in'
      sentence = 'Several beds are held here. Who just arrived?'
      extra = (
        <ul className="mt-8 grid gap-2.5">
          {res.holds.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                onClick={() => confirmHold(h)}
                disabled={confirming !== null}
                className="flex min-h-[72px] w-full items-center gap-3 rounded-[16px] border border-border bg-surface p-4 text-left shadow-[var(--shadow-card)] hover:bg-surface-2 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[18px] font-bold">{h.worker_name}</span>
                  <span className="block break-words text-[15px] text-text-3">{h.worker_org}</span>
                </span>
                <span className="shrink-0 text-right text-[15px] font-semibold text-blue-light">
                  {confirming === h.id ? 'Confirming…' : `${minutesUntil(h.expires_at, now)} min left`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )
    } else {
      tone = 'muted'
      icon = <Users aria-hidden size={48} className="text-text-muted" />
      title = 'No active holds'
      sentence = 'Nobody is holding a bed here right now.'
    }
  }

  return (
    <PageShell>
      <p className="text-center text-[13px] text-text-muted">
        Opened by tapping the Tap Board{name ? ` · ${name}` : ''}
      </p>

      <div className="mt-8 flex flex-col items-center text-center" aria-live="polite">
        <StatusCircle tone={tone}>{icon}</StatusCircle>
        <h1 className="mt-5 font-display text-[32px] font-bold leading-tight">{title}</h1>
        {sentence && <p className="mt-2 max-w-[340px] text-[16px] text-text-3">{sentence}</p>}
        {live && <LiveForWorkers />}
      </div>

      {extra}

      {state.kind === 'done' && (
        <Link to={`/staff/${shelterId}`} className="mt-8 flex min-h-12 items-center justify-center rounded-[14px] text-[15px] font-medium text-text-muted underline">
          Open shelter dashboard
        </Link>
      )}
    </PageShell>
  )
}
