import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'
import { useShelterUpdates } from './socket'
import type { Shelter } from './types'

const REFRESH_MS = 60_000 // also refreshes "updated X min ago"
const BUMP_MS = 1_200

/** All shelters, kept live via Socket.IO. `bumped` holds ids whose count just changed. */
export function useShelters() {
  const [shelters, setShelters] = useState<Shelter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bumped, setBumped] = useState<Set<string>>(new Set())
  const counts = useRef(new Map<string, number>())

  const load = useCallback(async () => {
    try {
      const list = await api.shelters()
      counts.current = new Map(list.map((s) => [s.id, s.open_beds]))
      setShelters(list)
      setError(null)
    } catch {
      setError("Can't reach LuminestBC right now. Retrying…")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  useShelterUpdates((updated) => {
    const changed = counts.current.get(updated.id) !== updated.open_beds
    counts.current.set(updated.id, updated.open_beds)
    setShelters((prev) => {
      const i = prev.findIndex((s) => s.id === updated.id)
      if (i < 0) return [...prev, updated]
      const next = prev.slice()
      next[i] = updated
      return next
    })
    if (!changed) return
    setBumped((prev) => new Set(prev).add(updated.id))
    setTimeout(() => {
      setBumped((prev) => {
        const next = new Set(prev)
        next.delete(updated.id)
        return next
      })
    }, BUMP_MS)
  })

  return { shelters, loading, error, bumped }
}
