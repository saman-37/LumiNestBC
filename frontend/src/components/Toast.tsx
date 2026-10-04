import { CircleAlert, CircleCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type Tone = 'info' | 'success' | 'error'
export interface ToastAction {
  label: string
  onClick: () => void
}
interface ToastItem {
  id: number
  message: string
  tone: Tone
  action?: ToastAction
}

const Ctx = createContext<(message: string, tone?: Tone, action?: ToastAction) => void>(() => {})

/**
 * Toasts sit at the bottom, above the map's sheet. Pages that have a sheet set the
 * CSS variable --toast-bottom on <html> to the sheet height.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const next = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((prev) => prev.filter((t) => t.id !== id)), [])

  const show = useCallback((message: string, tone: Tone = 'info', action?: ToastAction) => {
    const id = next.current++
    setToasts((prev) => [...prev.slice(-2), { id, message, tone, action }])
    setTimeout(() => dismiss(id), action ? 6000 : 3500) // longer when there's an Undo to press
  }, [dismiss])

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
              <span className="min-w-0 flex-1">{t.message}</span>
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick()
                    dismiss(t.id)
                  }}
                  className="-my-1 min-h-11 shrink-0 rounded-[10px] px-3 font-semibold text-[#8fe3b8] hover:bg-white/10"
                >
                  {t.action.label}
                </button>
              )}
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
