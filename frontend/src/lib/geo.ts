export interface LatLng {
  lat: number
  lng: number
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export type LocationResult = { ok: true; at: LatLng } | { ok: false; reason: 'insecure' | 'denied' | 'unavailable' }

/** The phone's location, or why it isn't available. Browsers only share it on https (or localhost). */
export function getLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (!window.isSecureContext) return resolve({ ok: false, reason: 'insecure' })
    if (!('geolocation' in navigator)) return resolve({ ok: false, reason: 'unavailable' })
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, at: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) => resolve({ ok: false, reason: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  })
}

/**
 * Look up a typed street address, intersection or place in BC with OpenStreetMap Nominatim
 * (free, no key). Only the typed text is sent; results favour Metro Vancouver.
 */
export async function geocodeAddress(text: string): Promise<(LatLng & { label: string }) | null> {
  const q = text.trim()
  if (q.length < 3) return null
  const params = new URLSearchParams({
    q: /\b(bc|british columbia)\b/i.test(q) ? q : `${q}, British Columbia`,
    format: 'jsonv2',
    limit: '1',
    countrycodes: 'ca',
    viewbox: '-123.6,49.6,-121.7,48.9', // Metro Vancouver and the Fraser Valley, preferred not required
    'accept-language': 'en',
  })
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
    if (!res.ok) return null
    const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string; name?: string }[]
    if (!hit) return null
    return { lat: Number(hit.lat), lng: Number(hit.lon), label: q } // show what they typed
  } catch {
    return null
  }
}
