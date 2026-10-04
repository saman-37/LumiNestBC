import { useEffect, useState } from 'react'

/** Haptic tick on Android (iOS Safari ignores navigator.vibrate). */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not supported
  }
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    mql.addEventListener('change', onChange)
    onChange()
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export function useViewportHeight(): number {
  const [h, setH] = useState(() => window.innerHeight)
  useEffect(() => {
    const onResize = () => setH(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return h
}

/**
 * Adds "low-perf" to <html> on phones that report few cores or little memory. CSS then swaps
 * frosted-glass blur (expensive on phones) for a solid surface.
 */
export function markLowPerformance(): void {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const lowCores = (nav.hardwareConcurrency ?? 8) <= 4
  const lowMemory = (nav.deviceMemory ?? 8) <= 4
  if (lowCores || lowMemory) document.documentElement.classList.add('low-perf')
}
