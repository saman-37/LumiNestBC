import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

/** A modal sheet that slides up from the bottom (centred dialog on desktop). */
export function Drawer({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[2500] flex items-end justify-center md:items-center">
          <motion.div
            className="absolute inset-0 bg-[#1f2d30]/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="relative max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[24px] bg-surface px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 shadow-[var(--shadow-float)] md:rounded-[20px]"
          >
            <div aria-hidden className="mx-auto mb-3 h-1 w-9 rounded-full bg-border-strong" />
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display text-[20px] font-bold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-text-2"
              >
                <X aria-hidden size={20} />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
