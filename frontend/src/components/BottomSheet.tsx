import { animate, motion, useDragControls, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useViewportHeight } from '../lib/device'

export type Snap = 'peek' | 'half' | 'full'
const ORDER: Snap[] = ['peek', 'half', 'full']
export const PEEK_HEIGHT = 180

/** reserveTop: pixels of floating UI above the sheet that "full" must not slide under. */
export function snapHeights(vh: number, reserveTop = 0): Record<Snap, number> {
  const half = Math.round(vh * 0.5)
  return { peek: PEEK_HEIGHT, half, full: Math.max(half, Math.min(Math.round(vh * 0.9), vh - reserveTop - 8)) }
}

interface Props {
  snap: Snap
  onSnap: (snap: Snap) => void
  /** Called instead of settling at "peek" when dragged down (used to close the detail view). */
  onDismiss?: () => void
  onHeightChange?: (visiblePx: number) => void
  header?: ReactNode
  children: ReactNode
  label: string
  reserveTop?: number
}

/**
 * Draggable bottom sheet with peek / half / full snap points. Drag from the handle or
 * header; the content scrolls inside whatever height is visible.
 */
export function BottomSheet({ snap, onSnap, onDismiss, onHeightChange, header, children, label, reserveTop = 0 }: Props) {
  const vh = useViewportHeight()
  const heights = useMemo(() => snapHeights(vh, reserveTop), [vh, reserveTop])
  const full = heights.full
  const y = useMotionValue(full - heights[snap])
  const controls = useDragControls()
  const reduce = useReducedMotion()
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(64)
  const scrollHeight = useTransform(y, (v) => Math.max(0, full - v - headerH))

  useLayoutEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const settle = (to: Snap) => {
    const controlsAnim = animate(y, full - heights[to], reduce ? { duration: 0 } : { type: 'spring', stiffness: 340, damping: 36 })
    onHeightChange?.(heights[to])
    return controlsAnim
  }

  useEffect(() => {
    const a = settle(snap)
    return () => a.stop()
  }, [snap, full]) // settle() reads the latest heights; re-run only when the target changes

  function onDragEnd(_: unknown, info: PanInfo) {
    const projected = full - y.get() - info.velocity.y * 0.2
    const nearest = ORDER.reduce((best, s) =>
      Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected) ? s : best,
    )
    if (onDismiss && nearest === 'peek') {
      onDismiss()
      return
    }
    if (nearest === snap) settle(snap)
    else onSnap(nearest)
  }

  const cycle = () => onSnap(snap === 'full' ? 'peek' : ORDER[ORDER.indexOf(snap) + 1])

  return (
    <motion.section
      aria-label={label}
      style={{ y, height: full }}
      drag="y"
      dragControls={controls}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: full - heights.peek }}
      dragElastic={0.06}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      className="fixed inset-x-0 bottom-0 z-[1000] flex flex-col rounded-t-[24px] bg-surface shadow-[0_-8px_32px_rgba(16,40,35,0.14)]"
    >
      <div ref={headerRef} onPointerDown={(e) => controls.start(e)} className="shrink-0 cursor-grab touch-none px-4 active:cursor-grabbing">
        <button
          type="button"
          onClick={cycle}
          aria-label={snap === 'full' ? 'Collapse list' : 'Expand list'}
          className="mx-auto -mb-2 flex h-11 w-24 items-center justify-center rounded-full"
        >
          <span aria-hidden className="h-1 w-9 rounded-full bg-border-strong" />
        </button>
        {header}
      </div>
      <motion.div style={{ height: scrollHeight }} className="overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {children}
      </motion.div>
    </motion.section>
  )
}
