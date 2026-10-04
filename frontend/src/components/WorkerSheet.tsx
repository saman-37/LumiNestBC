import { useState, type FormEvent } from 'react'
import type { Worker } from '../lib/worker'
import { Button } from './Button'
import { Drawer } from './Drawer'

interface Props {
  open: boolean
  onSave: (worker: Worker) => void
  onClose: () => void
}

const INPUT =
  'mt-1.5 block min-h-12 w-full rounded-[12px] border border-border-strong bg-surface-2 px-3.5 text-[16px] text-text ' +
  'placeholder:text-text-muted focus:border-blue focus:outline-none'

/** Asked once, then kept in localStorage on this phone. */
export function WorkerSheet({ open, onSave, onClose }: Props) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && org.trim()) onSave({ name: name.trim(), org: org.trim() })
  }

  return (
    <Drawer open={open} title="Who's holding this bed?" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-[15px] text-text-3">
          Saved on this phone only. A hold stores just your name and organisation, never anything about the person
          you're helping.
        </p>
        <label className="text-[13px] font-normal text-text-2">
          Your name
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus required maxLength={80} />
        </label>
        <label className="text-[13px] font-normal text-text-2">
          Organisation
          <input className={INPUT} value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" required maxLength={80} />
        </label>
        <Button type="submit">Save and hold bed</Button>
      </form>
    </Drawer>
  )
}
