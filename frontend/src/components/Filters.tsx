import { Check, SlidersHorizontal } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { vibrate } from '../lib/device'
import { FILTERS } from '../lib/filters'
import type { FilterKey } from '../lib/types'
import { Button } from './Button'
import { Drawer } from './Drawer'

const CHIP =
  'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-semibold transition-colors'
const CHIP_OFF = 'border border-border bg-surface text-text-2 shadow-[var(--shadow-card)] hover:bg-surface-2'
const CHIP_ON = 'border-[1.5px] border-green-strong bg-green-tint text-green-text'

interface BarProps {
  active: Set<FilterKey>
  onToggle: (key: FilterKey) => void
  onOpenSheet: () => void
}

export function FilterBar({ active, onToggle, onOpenSheet }: BarProps) {
  return (
    <div role="group" aria-label="Filter shelters" className="fade-x no-scrollbar flex gap-2 overflow-x-auto px-4 py-1">
      <motion.button
        type="button"
        whileTap={{ scale: 0.96 }}
        onClick={onOpenSheet}
        className={`${CHIP} ${CHIP_OFF}`}
      >
        <SlidersHorizontal aria-hidden size={18} />
        Filters
        {active.size > 0 && (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-green-strong px-1 text-[13px] text-white">
            {active.size}
          </span>
        )}
      </motion.button>
      {FILTERS.map(({ key, label, Icon }) => {
        const on = active.has(key)
        return (
          <motion.button
            key={key}
            type="button"
            aria-pressed={on}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            onClick={() => {
              vibrate(10)
              onToggle(key)
            }}
            className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {on ? (
                <motion.span
                  key="check"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 18, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="inline-flex overflow-hidden"
                >
                  <Check aria-hidden size={18} strokeWidth={2.5} />
                </motion.span>
              ) : (
                <motion.span key="icon" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="inline-flex">
                  <Icon aria-hidden size={18} />
                </motion.span>
              )}
            </AnimatePresence>
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}

interface SheetProps {
  open: boolean
  active: Set<FilterKey>
  resultCount: number
  onToggle: (key: FilterKey) => void
  onClear: () => void
  onClose: () => void
}

/** The same filters as big toggle rows, for people who prefer a list. */
export function FilterSheet({ open, active, resultCount, onToggle, onClear, onClose }: SheetProps) {
  return (
    <Drawer open={open} title="Filters" onClose={onClose}>
      <ul className="grid gap-2">
        {FILTERS.map(({ key, label, Icon }) => {
          const on = active.has(key)
          return (
            <li key={key}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                onClick={() => {
                  vibrate(10)
                  onToggle(key)
                }}
                className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] border px-4 text-left text-[15px] font-semibold ${
                  on ? 'border-green-strong bg-green-tint text-text' : 'border-border bg-surface text-text-2'
                }`}
              >
                <Icon aria-hidden size={20} className={on ? 'text-green-text' : 'text-text-muted'} />
                <span className="flex-1">{label}</span>
                <span aria-hidden className={`relative h-7 w-12 rounded-full transition-colors ${on ? 'bg-green-strong' : 'bg-border-strong'}`}>
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 600, damping: 32 }}
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${on ? 'right-1' : 'left-1'}`}
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 grid grid-cols-[auto_1fr] gap-2.5">
        <Button variant="outline" size="lg" className="px-5" onClick={onClear} disabled={!active.size}>
          Clear all
        </Button>
        <Button onClick={onClose}>
          Show {resultCount} {resultCount === 1 ? 'match' : 'matches'}
        </Button>
      </div>
    </Drawer>
  )
}
