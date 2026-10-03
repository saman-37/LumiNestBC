import { FILTERS } from '../lib/filters'
import type { FilterKey } from '../lib/types'

interface Props {
  active: Set<FilterKey>
  onToggle: (key: FilterKey) => void
}

export function FilterChips({ active, onToggle }: Props) {
  return (
    <div role="group" aria-label="Filter shelters" className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
      {FILTERS.map(({ key, label, Icon }) => {
        const on = active.has(key)
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(key)}
            className={`inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full border px-4 text-base font-medium transition-colors focus-visible:outline-2 focus-visible:outline-light ${
              on ? 'border-light bg-light text-ink-on-light' : 'border-line bg-surface/90 text-ink'
            }`}
          >
            <Icon aria-hidden size={18} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
