import { motion, useReducedMotion } from 'motion/react'

/** A check mark that draws itself in (SVG stroke animation). */
export function CheckDraw({ size = 56, color = 'var(--green-strong)', delay = 0.1 }: { size?: number; color?: string; delay?: number }) {
  const reduce = useReducedMotion()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: reduce ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : delay, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  )
}
