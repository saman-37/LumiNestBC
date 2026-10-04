import { useEffect, useState, type FormEvent } from 'react'
import type { Shelter, StaffSettings } from '../../lib/types'
import { Button } from '../Button'
import { Section } from './Section'

const INPUT =
  'mt-1 block h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3 text-[16px] focus:border-blue focus:outline-none'

function Toggle({ label, hint, on, disabled, onChange }: { label: string; hint: string; on: boolean; disabled: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-3.5 py-2 text-left disabled:opacity-50 ${
        on ? 'border-green-strong bg-green-tint' : 'border-border bg-surface'
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{label}</span>
        <span className="block text-[13px] text-text-muted">{hint}</span>
      </span>
      <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-green-strong' : 'bg-border-strong'}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'right-1' : 'left-1'}`} />
      </span>
    </button>
  )
}

/** Tonight's settings: pets, accepting new people, the SMS phone and capacity. */
export function SettingsPanel({ shelter, busy, onSave }: { shelter: Shelter; busy: boolean; onSave: (s: StaffSettings) => void }) {
  const [phone, setPhone] = useState(shelter.staff_phone ?? '')
  const [capacity, setCapacity] = useState(String(shelter.capacity || ''))
  useEffect(() => setPhone(shelter.staff_phone ?? ''), [shelter.staff_phone])
  useEffect(() => setCapacity(String(shelter.capacity || '')), [shelter.capacity])

  const capacityValue = capacity.trim() === '' ? 0 : /^\d+$/.test(capacity.trim()) ? Number(capacity) : null
  const changed = (!shelter.is_dv && phone.trim() !== (shelter.staff_phone ?? '')) || capacityValue !== shelter.capacity

  function save(e: FormEvent) {
    e.preventDefault()
    if (capacityValue === null) return
    const settings: StaffSettings = { capacity: capacityValue }
    if (!shelter.is_dv) settings.staff_phone = phone.trim()
    onSave(settings)
  }

  return (
    <Section title="Tonight's settings" id="settings">
      <div className="grid gap-2">
        <Toggle
          label="Accepting new people"
          hint={shelter.accepting ? 'Outreach workers can hold beds' : 'Hidden from holds and the voice line'}
          on={shelter.accepting}
          disabled={busy}
          onChange={(accepting) => onSave({ accepting })}
        />
        <Toggle
          label="Pets accepted"
          hint="Shown with a paw on the map"
          on={shelter.pets_ok}
          disabled={busy}
          onChange={(pets_ok) => onSave({ pets_ok })}
        />
      </div>
      <form onSubmit={save} className="mt-4 grid gap-3">
        {shelter.is_dv ? (
          <p className="text-[13px] text-text-muted">Confidential shelters don't keep a staff phone on file, so they can't update by text.</p>
        ) : (
          <label className="text-[13px] text-text-2">
            Staff phone for text updates
            <input type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="604-555-0101" className={INPUT} />
            <span className="mt-1 block text-[13px] text-text-muted">Texts like "3 beds open" from this number update the count.</span>
          </label>
        )}
        <label className="text-[13px] text-text-2">
          Capacity (beds in total)
          <input inputMode="numeric" pattern="[0-9]*" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unknown" className={`${INPUT} tabular`} />
        </label>
        <Button type="submit" size="md" disabled={busy || !changed || capacityValue === null}>
          Save settings
        </Button>
      </form>
    </Section>
  )
}
