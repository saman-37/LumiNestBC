import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { useShelterUpdates, useSocketConnected } from './socket'
import type { Shelter } from './types'

const REFRESH_MS = 60_000 // also refreshes "updated X min ago"
const BUMP_MS = 1_200

interface ShelterStore {
  shelters: Shelter[]
  loading: boolean
  error: string | null
  /** ids whose count just changed (drives the pin pop / number animations) */
  bumped: Set<string>
  connected: boolean
  upsert: (shelter: Shelter) => void
}

const Ctx = createContext<ShelterStore | null>(null)

/** One live copy of every shelter for the whole app (REST load + Socket.IO updates). */
export function ShelterProvider({ children }: { children: ReactNode }) {
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

  const connected = useSocketConnected(load)

  const upsert = useCallback((updated: Shelter) => {
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
  }, [])

  useShelterUpdates(upsert)

  return (
    <Ctx.Provider value={{ shelters, loading, error, bumped, connected, upsert }}>{children}</Ctx.Provider>
  )
}

export function useShelterStore(): ShelterStore {
  const store = useContext(Ctx)
  if (!store) throw new Error('useShelterStore must be used inside <ShelterProvider>')
  return store
}
