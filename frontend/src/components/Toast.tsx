import { CircleAlert, CircleCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Tone = 'info' | 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const Ctx = createContext<(message: string, tone?: Tone) => void>(() => {})

/**
 * Toasts sit at the bottom, above the map's sheet. Pages that have a sheet set the
 * CSS variable --toast-bottom on <html> to the sheet height.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const next = useRef(1)

  const show = useCallback((message: string, tone: Tone = 'info') => {
    const id = next.current++
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <Ctx.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 z-[3000] flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(var(--toast-bottom, 24px) + env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-auto flex w-full max-w-[440px] items-center gap-2.5 rounded-[14px] bg-tooltip-bg px-4 py-3 text-[15px] font-medium text-white shadow-[var(--shadow-float)]"
            >
              {t.tone === 'error' ? (
                <CircleAlert aria-hidden size={18} className="shrink-0 text-[#ff9a90]" />
              ) : (
                <CircleCheck aria-hidden size={18} className="shrink-0 text-[#8fe3b8]" />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  return useContext(Ctx)
}
