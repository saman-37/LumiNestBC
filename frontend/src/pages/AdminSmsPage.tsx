import { Send } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { AdminShell } from '../components/admin/AdminShell'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { useToast } from '../components/Toast'
import { adminApi, ApiError } from '../lib/api'
import { useShelterStore } from '../lib/shelterStore'
import type { AdminShelter } from '../lib/types'

const QUICK = ['3 beds open', '1 more bed', 'We are full']
const FIELD = 'h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3 text-[16px] focus:border-blue focus:outline-none'

/** Staff SMS simulator: same handler as POST /twilio/sms, minus Twilio. */
function SmsSimulator({ adminKey }: { adminKey: string }) {
  const toast = useToast()
  const { shelters: live } = useShelterStore()
  const [shelters, setShelters] = useState<AdminShelter[]>([])
  const [shelterId, setShelterId] = useState('')
  const [from, setFrom] = useState('')
  const [body, setBody] = useState('')
  const [thread, setThread] = useState<{ who: 'staff' | 'reply'; text: string }[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    adminApi.shelters(adminKey).then((list) => {
      const smsable = list.filter((s) => !s.is_dv)
      setShelters(smsable)
      const first = smsable.find((s) => s.staff_phone) ?? smsable[0]
      if (first) {
        setShelterId(first.id)
        setFrom(first.staff_phone ?? '')
      }
    })
  }, [adminKey])

  const chosen = shelters.find((s) => s.id === shelterId)
  const liveShelter = live.find((s) => s.id === shelterId) ?? chosen

  async function send(text: string) {
    if (!text.trim() || !from.trim()) return
    setBusy(true)
    setThread((t) => [...t, { who: 'staff', text: text.trim() }])
    try {
      const res = await adminApi.sms(adminKey, from.trim(), text.trim())
      setThread((t) => [...t, { who: 'reply', text: res.reply }])
    } catch (e) {
      toast(`SMS simulator failed (${e instanceof ApiError ? e.code : 'network_error'})`, 'error')
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    send(body)
    setBody('')
  }

  return (
    <>
      <div className="grid gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <label className="text-[13px] text-text-2">
          Shelter
          <select
            value={shelterId}
            onChange={(e) => {
              setShelterId(e.target.value)
              setFrom(shelters.find((s) => s.id === e.target.value)?.staff_phone ?? '')
              setThread([])
            }}
            className={`mt-1 ${FIELD}`}
          >
            {shelters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.staff_phone ? '' : ' (no staff phone)'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[13px] text-text-2">
          From (the shelter's staff phone)
          <input type="tel" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="604-555-0101" className={`mt-1 ${FIELD}`} />
        </label>
        {chosen && !chosen.staff_phone && (
          <p className="text-[13px] text-amber-text">This shelter has no staff phone, so texts won't match. Add one in its staff portal settings.</p>
        )}
        {liveShelter && (
          <p className="text-[15px] text-text-2">
            Live count:{' '}
            <AnimatedNumber value={liveShelter.open_beds} className="font-display text-[22px] font-bold text-green-text" /> open
          </p>
        )}
      </div>

      <div className="mt-4 flex min-h-[140px] flex-col gap-2 rounded-[20px] bg-surface-2 p-3" aria-live="polite">
        {thread.length === 0 && <p className="text-[15px] text-text-muted">Messages appear here.</p>}
        {thread.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-[16px] px-3 py-2 text-[15px] ${
              m.who === 'staff' ? 'self-end bg-green-strong text-white' : 'self-start border border-border bg-surface'
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => send(q)}
            className="min-h-11 rounded-full border border-border bg-surface px-3.5 text-[15px] font-semibold shadow-[var(--shadow-card)] disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="sms-body">Message</label>
        <input id="sms-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a staff text" className={`min-w-0 flex-1 ${FIELD}`} />
        <button type="submit" aria-label="Send" disabled={busy || !body.trim()} className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-green-strong text-white disabled:opacity-50">
          <Send aria-hidden size={20} />
        </button>
      </form>
    </>
  )
}

export default function AdminSmsPage() {
  return <AdminShell title="SMS simulator">{(key) => <SmsSimulator adminKey={key} />}</AdminShell>
}
