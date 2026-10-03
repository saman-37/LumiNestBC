import { useState, type FormEvent } from 'react'
import type { Worker } from '../lib/worker'
import { Button } from './Button'

interface Props {
  onSave: (worker: Worker) => void
  onCancel: () => void
}

const INPUT =
  'mt-1 block min-h-14 w-full rounded-xl border border-line bg-night px-4 text-lg text-ink ' +
  'placeholder:text-muted focus:border-light focus:outline-none'

/** Asked once; saved on this phone only. */
export function WorkerPrompt({ onSave, onCancel }: Props) {
  const [name, setName] = useState('')
  const [org, setOrg] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (name.trim() && org.trim()) onSave({ name: name.trim(), org: org.trim() })
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="worker-title" className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 sm:items-center">
      <form onSubmit={submit} className="grid w-full max-w-md gap-4 rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),20px)] sm:rounded-3xl">
        <h2 id="worker-title" className="text-xl font-bold">Who's holding this bed?</h2>
        <p className="text-sm text-muted">
          Saved on this phone only. A hold stores just your name and organisation, never anything about the person
          you're helping.
        </p>
        <label className="font-medium">
          Your name
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={80} />
        </label>
        <label className="font-medium">
          Organisation
          <input className={INPUT} value={org} onChange={(e) => setOrg(e.target.value)} autoComplete="organization" required maxLength={80} />
        </label>
        <Button type="submit">Save and hold bed</Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </form>
    </div>
  )
}
