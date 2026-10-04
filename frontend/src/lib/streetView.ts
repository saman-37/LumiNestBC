import type { Shelter } from './types'

// Google Street View photos of a shelter's exterior, so a worker can recognise the door.
// Terms: images are always loaded from Google's URL (never downloaded or stored) and shown
// with a "© Google" caption. Only the free metadata check is cached, in memory, per session.
// The key is a browser key: restrict it by HTTP referrer in Google Cloud.

const KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY
const BASE = 'https://maps.googleapis.com/maps/api/streetview'

const available = new Map<string, Promise<boolean>>()

function location(s: Shelter): string | null {
  if (s.is_dv || s.lat === null || s.lng === null) return null // DV shelters never get a photo
  return `${s.lat},${s.lng}`
}

/** True only when Street View has an outdoor image here (metadata status OK). */
export function hasStreetView(s: Shelter): Promise<boolean> {
  const loc = location(s)
  if (!KEY || !loc) return Promise.resolve(false)
  let check = available.get(loc)
  if (!check) {
    check = fetch(`${BASE}/metadata?location=${loc}&source=outdoor&key=${KEY}`)
      .then((r) => r.json())
      .then((d: { status?: string }) => d.status === 'OK')
      .catch(() => false)
    available.set(loc, check)
  }
  return check
}

export function streetViewUrl(s: Shelter): string | null {
  const loc = location(s)
  if (!KEY || !loc) return null
  return `${BASE}?size=640x400&location=${loc}&fov=80&source=outdoor&key=${KEY}`
}
