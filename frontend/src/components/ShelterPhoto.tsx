import { House } from 'lucide-react'
import { useEffect, useState } from 'react'
import { hasStreetView, streetViewUrl } from '../lib/streetView'
import type { Shelter } from '../lib/types'

type Size = 'sm' | 'md' | 'lg'

const BOX: Record<Size, string> = {
  sm: 'h-16 w-[88px] rounded-[10px]',
  md: 'h-[72px] w-[72px] rounded-[12px]',
  lg: 'h-40 w-full rounded-[16px]',
}
const ICON: Record<Size, number> = { sm: 24, md: 26, lg: 40 }

/**
 * Street View photo of the building, with a shimmer while loading and a green house tile
 * when there's no key, no imagery, or an error. Never renders for DV shelters.
 */
export function ShelterPhoto({ shelter, size }: { shelter: Shelter; size: Size }) {
  const [status, setStatus] = useState<'checking' | 'ok' | 'none'>('checking')
  const [loaded, setLoaded] = useState(false)
  const url = streetViewUrl(shelter)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setStatus(url ? 'checking' : 'none')
    if (url) hasStreetView(shelter).then((ok) => !cancelled && setStatus(ok ? 'ok' : 'none'))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check only when the location changes
  }, [url])

  if (shelter.is_dv) return null

  return (
    <div className={`relative shrink-0 overflow-hidden ${BOX[size]}`}>
      {status === 'none' ? (
        <div aria-hidden className="grid h-full w-full place-items-center bg-green-tint">
          <House size={ICON[size]} className="text-green-text" />
        </div>
      ) : (
        <>
          {!loaded && <div aria-hidden className="skeleton absolute inset-0 rounded-none" />}
          {status === 'ok' && url && (
            <img
              src={url}
              alt={`Street view of ${shelter.name}`}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={() => setStatus('none')}
              className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
          )}
          {loaded && (
            <span className="absolute bottom-0.5 right-1 rounded bg-black/55 px-1 text-[9px] leading-tight text-white">© Google</span>
          )}
        </>
      )}
    </div>
  )
}
