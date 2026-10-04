import type { Map as LeafletMap } from 'leaflet'
import { shelterState, type ShelterState } from './filters'
import type { Shelter } from './types'

/** Pins closer than this (screen px) at the current zoom merge into one cluster light. */
const RADIUS_PX = 60

export interface Cluster {
  key: string
  members: Shelter[]
  lat: number
  lng: number
}

function rank(s: Shelter): number {
  const state = shelterState(s)
  return state === 'open' || state === 'open-one' ? 1 : 0
}

/**
 * Greedy screen-space clustering at one zoom level. Open shelters seed clusters first, so a
 * cluster sits where the beds are. Every shelter lands in exactly one group (often alone).
 */
export function clusterShelters(map: LeafletMap, shelters: Shelter[], zoom: number): Cluster[] {
  const points = shelters
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s) => ({ s, p: map.project([s.lat!, s.lng!], zoom) }))
    .sort((a, b) => rank(b.s) - rank(a.s) || b.s.open_beds - a.s.open_beds || a.s.id.localeCompare(b.s.id))
  const used = new Set<string>()
  const clusters: Cluster[] = []
  for (const seed of points) {
    if (used.has(seed.s.id)) continue
    const group = points.filter((o) => !used.has(o.s.id) && o.p.distanceTo(seed.p) <= RADIUS_PX)
    group.forEach((o) => used.add(o.s.id))
    clusters.push({
      key: group.map((o) => o.s.id).sort().join('|'),
      members: group.map((o) => o.s),
      lat: group.reduce((t, o) => t + o.s.lat!, 0) / group.length,
      lng: group.reduce((t, o) => t + o.s.lng!, 0) / group.length,
    })
  }
  return clusters
}

/** What a cluster light shows: the open beds of its shelters, else Full. */
export function clusterSummary(members: Shelter[]): { state: ShelterState; label: string; open: number } {
  let open = 0
  for (const s of members) {
    const state = shelterState(s)
    if (state === 'open' || state === 'open-one') open += s.open_beds
  }
  if (open > 0) return { state: open >= 2 ? 'open' : 'open-one', label: String(open), open }
  return { state: 'full', label: 'Full', open }
}
