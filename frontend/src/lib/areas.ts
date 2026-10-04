import type { LatLng } from './geo'

// Search areas for the "Searching near" field. Mirrors data/area_centres.json (owned by
// Design/data); keep the two in sync if you add areas.
export interface Area extends LatLng {
  name: string
  aliases: string[]
}

export const DEFAULT_AREA: Area = {
  name: 'Main St & Hastings, Vancouver',
  aliases: ['downtown eastside', 'dtes', 'main and hastings', 'main & hastings', 'oppenheimer park'],
  lat: 49.281,
  lng: -123.099,
}

export const AREAS: Area[] = [
  DEFAULT_AREA,
  { name: 'Downtown Vancouver', aliases: ['downtown', 'granville', 'waterfront'], lat: 49.2827, lng: -123.1207 },
  { name: 'Mount Pleasant', aliases: ['main street', 'broadway and main'], lat: 49.263, lng: -123.1 },
  { name: 'Surrey Whalley', aliases: ['whalley', 'surrey central', 'king george', 'surrey'], lat: 49.1906, lng: -122.849 },
  { name: 'Surrey Newton', aliases: ['newton'], lat: 49.1328, lng: -122.8466 },
  { name: 'Burnaby Metrotown', aliases: ['metrotown', 'burnaby'], lat: 49.2276, lng: -123.0076 },
  { name: 'New Westminster', aliases: ['new west', 'columbia street'], lat: 49.2057, lng: -122.911 },
  { name: 'Richmond Centre', aliases: ['richmond'], lat: 49.1666, lng: -123.1364 },
  { name: 'North Vancouver Lonsdale', aliases: ['north van', 'north vancouver', 'lonsdale'], lat: 49.31, lng: -123.074 },
  { name: 'Coquitlam Centre', aliases: ['coquitlam', 'tri-cities', 'port coquitlam'], lat: 49.278, lng: -122.799 },
  { name: 'Langley City', aliases: ['langley'], lat: 49.1044, lng: -122.66 },
  { name: 'Maple Ridge', aliases: ['haney'], lat: 49.219, lng: -122.601 },
]

export function findArea(text: string): Area | null {
  const q = text.trim().toLowerCase()
  if (!q) return null
  return (
    AREAS.find((a) => a.name.toLowerCase() === q) ??
    AREAS.find((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase())) ??
    AREAS.find((a) => a.aliases.some((alias) => q.includes(alias) || alias.includes(q))) ??
    null
  )
}
