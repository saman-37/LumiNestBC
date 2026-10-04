import { Mic, Phone, Send, Square } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AdminShell } from '../components/admin/AdminShell'
import { useToast } from '../components/Toast'
import { adminApi, API_BASE, ApiError } from '../lib/api'
import type { VoiceLine, VoiceSimResult } from '../lib/types'

// Phone-call simulator: runs the real voice pipeline (Gemini -> matcher -> templates ->
// ElevenLabs) without a phone. Doubles as a demo backup if the phone line fails.

const REHEARSED = [
  "Any women's beds near Surrey tonight?",
  'I have a dog, anywhere in Burnaby?',
  'Family of four near Metrotown',
]

interface Bubble {
  who: 'caller' | 'line'
  text: string
  note?: string
}

// Minimal Web Speech API typing (not in every TS DOM lib).
interface Recognition {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition
const SpeechRecognitionCtor: RecognitionCtor | undefined =
  (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition

function playLine(line: VoiceLine, stopped: () => boolean): Promise<void> {
  return new Promise((done) => {
    // Never let one stalled clip hang the call: give up after roughly how long it takes to say.
    let finished = false
    const resolve = () => {
      if (!finished) {
        finished = true
        window.clearTimeout(safety)
        done()
      }
    }
    const safety = window.setTimeout(resolve, Math.max(4000, line.text.length * 90))
    if (stopped()) return resolve()
    if (line.audio_url) {
      const audio = new Audio(API_BASE + line.audio_url)
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
      return
    }
    // No ElevenLabs audio: on a real call Twilio's <Say> voice reads it. The browser stands in.
    if (!('speechSynthesis' in window)) return resolve()
    const utterance = new SpeechSynthesisUtterance(line.text)
    utterance.lang = 'en-CA'
    utterance.onend = () => resolve()
    utterance.onerror = () => resolve()
    window.speechSynthesis.speak(utterance)
  })
}

function Simulator({ adminKey }: { adminKey: string }) {
  const toast = useToast()
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [result, setResult] = useState<VoiceSimResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const [text, setText] = useState('')
  const stopRef = useRef(false)
  const recognition = useRef<Recognition | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' }) // returns a Promise in newer browsers: don't return it
  }, [bubbles])
  useEffect(() => () => {
    stopRef.current = true
    window.speechSynthesis?.cancel()
  }, [])

  async function call(transcript: string) {
    if (!transcript.trim() || busy) return
    stopRef.current = false
    setBusy(true)
    setResult(null)
    setBubbles([{ who: 'caller', text: transcript.trim() }])
    try {
      const res = await adminApi.voice(adminKey, transcript.trim())
      setResult(res)
      for (const line of res.lines) {
        if (stopRef.current) break
        setBubbles((b) => [...b, { who: 'line', text: line.text, note: line.audio_url ? undefined : "Twilio's voice (fallback)" }])
        await playLine(line, () => stopRef.current)
      }
    } catch (e) {
      toast(`Voice simulator failed (${e instanceof ApiError ? e.code : 'network_error'})`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function hangUp() {
    stopRef.current = true
    window.speechSynthesis?.cancel()
    recognition.current?.stop()
    setBusy(false)
  }

  function listen() {
    if (!SpeechRecognitionCtor) return
    const r = new SpeechRecognitionCtor()
    r.lang = 'en-CA'
    r.interimResults = false
    r.onresult = (e) => call(e.results[0][0].transcript)
    r.onerror = () => toast("Didn't catch that. Try again or type it.", 'error')
    r.onend = () => setListening(false)
    recognition.current = r
    setListening(true)
    r.start()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    call(text)
    setText('')
  }

  return (
    <>
      <div className="rounded-[24px] bg-tooltip-bg p-4 text-white shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 text-[13px] text-tooltip-body">
          <Phone aria-hidden size={16} /> LuminestBC voice line {busy ? '· on a call' : '· ready'}
        </div>
        <div className="mt-3 flex min-h-[180px] flex-col gap-2" aria-live="polite">
          {bubbles.length === 0 && (
            <p className="text-[15px] text-tooltip-body">Press the mic and speak like a caller, or pick a rehearsed line.</p>
          )}
          {bubbles.map((b, i) => (
            <div key={i} className={`max-w-[88%] rounded-[16px] px-3 py-2 text-[15px] ${b.who === 'caller' ? 'self-end bg-[#2f7df6]' : 'self-start bg-white/10'}`}>
              {b.text}
              {b.note && <span className="mt-0.5 block text-[13px] text-tooltip-body">{b.note}</span>}
            </div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="mt-4 flex items-center justify-center gap-4">
          {SpeechRecognitionCtor && (
            <button
              type="button"
              onClick={listen}
              disabled={busy || listening}
              aria-label={listening ? 'Listening' : 'Speak'}
              className={`grid h-20 w-20 place-items-center rounded-full text-white shadow-lg disabled:opacity-60 ${listening ? 'animate-pulse bg-red' : 'bg-green-strong'}`}
            >
              <Mic aria-hidden size={34} />
            </button>
          )}
          {busy && (
            <button type="button" onClick={hangUp} aria-label="Hang up" className="grid h-14 w-14 place-items-center rounded-full bg-red text-white">
              <Square aria-hidden size={22} />
            </button>
          )}
        </div>
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <label className="sr-only" htmlFor="voice-text">What the caller says</label>
          <input
            id="voice-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SpeechRecognitionCtor ? 'Or type what the caller says' : 'Type what the caller says'}
            className="h-12 min-w-0 flex-1 rounded-[12px] border border-white/20 bg-white/10 px-3 text-[16px] text-white placeholder:text-tooltip-body focus:outline-none"
          />
          <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-green-strong disabled:opacity-50">
            <Send aria-hidden size={20} />
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-2">
        {REHEARSED.map((line) => (
          <button
            key={line}
            type="button"
            disabled={busy}
            onClick={() => call(line)}
            className="min-h-12 rounded-[12px] border border-border bg-surface px-3 text-left text-[15px] font-medium shadow-[var(--shadow-card)] hover:bg-surface-2 disabled:opacity-50"
          >
            “{line}”
          </button>
        ))}
      </div>

      {result && (
        <details className="mt-4 rounded-[16px] border border-border bg-surface p-3.5 shadow-[var(--shadow-card)]">
          <summary className="min-h-11 cursor-pointer text-[15px] font-semibold leading-[44px]">Debug</summary>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
            {Object.entries(result.timings_ms).map(([step, ms]) => (
              <div key={step} className="rounded-[10px] bg-surface-2 px-3 py-2">
                <dt className="text-text-muted">{step === 'gemini' ? `${result.extractor} extraction` : step}</dt>
                <dd className="tabular text-[16px] font-bold">{ms} ms</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[13px] text-text-muted">
            Voice: {result.voice === 'elevenlabs' ? 'ElevenLabs' : "Twilio <Say> fallback (no ElevenLabs audio)"}
            {result.area && ` · area: ${result.area}`}
          </p>
          <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Extracted request</h3>
          <pre className="mt-1 overflow-x-auto rounded-[10px] bg-surface-2 p-2 text-[13px]">{JSON.stringify(result.request, null, 2)}</pre>
          <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-text-muted">Matches</h3>
          {result.matches.length === 0 ? (
            <p className="text-[13px] text-text-muted">No match (the caller hears the BC 211 line).</p>
          ) : (
            <ol className="mt-1 grid gap-1 text-[13px]">
              {result.matches.map((m) => (
                <li key={m.id} className="rounded-[10px] bg-surface-2 px-3 py-2">
                  <span className="font-semibold">{m.is_dv ? 'Confidential DV shelter' : m.name}</span> · {m.open_beds} open · score{' '}
                  {m.score}
                  {m.distance_km !== null && ` · ${m.distance_km.toFixed(1)} km`}
                </li>
              ))}
            </ol>
          )}
        </details>
      )}
    </>
  )
}

export default function AdminVoicePage() {
  return <AdminShell title="Voice line simulator">{(key) => <Simulator adminKey={key} />}</AdminShell>
}
