import { FILTERS } from '../lib/filters'
import type { Shelter } from '../lib/types'

export function RestrictionTags({ shelter }: { shelter: Shelter }) {
  const tags = FILTERS.filter((f) => shelter[f.key])
  if (!tags.length) return <p className="text-sm text-muted">No restrictions listed</p>
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Who this shelter serves">
      {tags.map(({ key, label, Icon }) => (
        <li key={key} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-sm text-ink">
          <Icon aria-hidden size={16} className="text-light" />
          {label}
        </li>
      ))}
    </ul>
  )
}
