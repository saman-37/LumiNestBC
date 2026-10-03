import { useEffect, useState } from 'react'

export interface LatLng {
  lat: number
  lng: number
}

/** Vancouver Downtown Eastside: used when the phone won't share its location. */
export const DEFAULT_CENTRE: LatLng = { lat: 49.281, lng: -123.099 }

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

/** The phone's location once, or null (denied, unavailable, or not https). */
export function useMyLocation(): LatLng | null {
  const [location, setLocation] = useState<LatLng | null>(null)
  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])
  return location
}
