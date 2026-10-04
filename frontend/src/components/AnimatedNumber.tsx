import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

interface Props {
  value: number
  /** Start from this value on mount (e.g. the old count on the tag page). */
  from?: number
  suffix?: string
  className?: string
}

/** A count that rolls to its new value instead of jumping. Tabular so it doesn't jiggle. */
export function AnimatedNumber({ value, from, suffix = '', className = '' }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(from ?? value)
  const reduce = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || current.current === value) {
      current.current = value
      el.textContent = `${value}${suffix}`
      return
    }
    const controls = animate(current.current, value, {
      duration: 0.6,
      ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => {
        current.current = v
        el.textContent = `${Math.round(v)}${suffix}`
      },
    })
    return () => controls.stop()
  }, [value, suffix, reduce])

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {Math.round(current.current)}
      {suffix}
    </span>
  )
}
