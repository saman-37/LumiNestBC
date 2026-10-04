import { LocateFixed, Mic, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { AREAS } from '../lib/areas'

interface Props {
  label: string
  locating: boolean
  onSearch: (text: string) => void
  onLocate: () => void
  onFocus?: () => void
  onVoiceMatch?: () => void
}

/** "Searching near" field: type an area (with suggestions) or use the phone's location. */
export function SearchNear({ label, locating, onSearch, onLocate, onFocus, onVoiceMatch }: Props) {
  const [text, setText] = useState(label)
  useEffect(() => setText(label), [label])

  function submit(e: FormEvent) {
    e.preventDefault()
    onSearch(text)
  }

  return (
    <form onSubmit={submit} className="px-3.5 pb-2 pt-2" role="search">
      <label htmlFor="search-near" className="text-[13px] font-normal uppercase tracking-wide text-text-muted">
        Searching near
      </label>
      <div className="mt-1 flex gap-1.5">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden size={18} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            id="search-near"
            list="search-areas"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => {
              e.target.select()
              onFocus?.()
            }}
            onBlur={() => text !== label && text.trim() && onSearch(text)}
            enterKeyHint="search"
            autoComplete="off"
            className="h-11 w-full text-ellipsis rounded-[12px] border border-border bg-surface-2 pl-[30px] pr-1.5 text-[16px] text-text placeholder:text-text-muted focus:border-blue focus:outline-none"
          />
          <datalist id="search-areas">
            {AREAS.map((a) => (
              <option key={a.name} value={a.name} />
            ))}
          </datalist>
        </div>
        {onVoiceMatch && (
          <button
            type="button"
            onClick={onVoiceMatch}
            aria-label="Voice bed match"
            title="Voice bed match (speak or type needs)"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-green-tint-border bg-green-tint text-green-strong hover:bg-green-tint/80 active:scale-95"
          >
            <Mic aria-hidden size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          aria-label="Use my location"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-border bg-surface text-blue hover:bg-surface-2 disabled:opacity-60"
        >
          <LocateFixed aria-hidden size={20} className={locating ? 'animate-pulse' : ''} />
        </button>
      </div>
    </form>
  )
}
