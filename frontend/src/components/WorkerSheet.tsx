import { useEffect, useState, type FormEvent } from 'react'
import type { Worker } from '../lib/worker'
import { Button } from './Button'
import { Drawer } from './Drawer'

interface Props {
  open: boolean
  /** the shelter about to be held, shown so the worker knows what they're confirming */
  shelterName: string | null
  /** last name and org used on this phone, pre-filled (change them for this hold if needed) */
  initial: Worker | null
  onSave: (worker: Worker) => void
  onClose: () => void
}

const INPUT =
  'mt-1.5 block min-h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-[16px] text-text ' +
  'placeholder:text-text-muted focus:border-blue focus:outline-none'

/** Asked on every hold, pre-filled with the last name used on this phone (kept in localStorage). */
export function WorkerSheet({ open, shelterName, initial, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setOrg(initial?.org ?? '')
  }, [open, initial?.name, initial?.org])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && org.trim()) onSave({ name: name.trim(), org: org.trim() })
  }

  return (
    <Drawer open={open} title="Who's holding this bed?" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-[15px] text-text-3">
          {shelterName && (
            <>
              Holding 1 bed at <strong className="text-text">{shelterName}</strong> for 60 minutes.{' '}
            </>
          )}
          A hold stores just your name and organisation, never anything about the person you're helping.
        </p>
        <label className="text-[13px] font-normal text-text-2">
          Your name
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus={!initial} required maxLength={80} />
        </label>
        <label className="text-[13px] font-normal text-text-2">
          Organisation
          <input className={INPUT} value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" required maxLength={80} />
        </label>
        <Button type="submit" disabled={!name.trim() || !org.trim()}>
          {name.trim() ? `Hold bed as ${name.trim()}` : 'Hold bed'}
        </Button>
      </form>
    </Drawer>
  )
}
