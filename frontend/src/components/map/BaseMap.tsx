import type { MaplibreGL } from 'leaflet'
import type { StyleSpecification } from 'maplibre-gl'
import { useEffect, useState } from 'react'
import { TileLayer, useMap } from 'react-leaflet'
import { loadMapStyle, VECTOR_ATTRIBUTION } from '../../lib/mapStyle'

// Raster fallback when OpenFreeMap is unreachable: CARTO Voyager (needs VITE_CARTO_KEY), else OSM.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY
const FALLBACK_TILES = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_ATTRIBUTION = CARTO_KEY ? '© OpenStreetMap contributors © CARTO' : '© OpenStreetMap contributors'

function VectorLayer({ style }: { style: StyleSpecification }) {
  const map = useMap()
  useEffect(() => {
    // MapLibre is large (≈1 MB) and its WebGL setup is the heaviest work on the page, so it starts
    // only once the pins and list have painted and the browser is idle. Until then the map shows
    // its land colour with the pins already on it.
    let layer: MaplibreGL | null = null
    let cancelled = false
    const load = () => Promise.all([
      import('@maplibre/maplibre-gl-leaflet'),
      import('maplibre-gl/dist/maplibre-gl.css'), // ~60 KB of CSS, only needed once MapLibre runs
      import('maplibre-gl'),
      // Bundled by Vite into one worker file; MapLibre's own relative worker URL breaks once bundled.
      import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'),
    ]).then(([{ maplibreGL }, , maplibre, worker]) => {
      if (cancelled) return
      maplibre.setWorkerUrl(worker.default)
      layer = maplibreGL({ style, attributionControl: false })
      layer.addTo(map)
    })
    // Safari has no requestIdleCallback: a short timeout does the same job there.
    const idle = 'requestIdleCallback' in window
    const handle = idle ? window.requestIdleCallback(load, { timeout: 1500 }) : window.setTimeout(load, 300)
    return () => {
      cancelled = true
      if (idle) window.cancelIdleCallback(handle)
      else window.clearTimeout(handle)
      layer?.remove()
    }
  }, [map, style])
  return null
}

let cachedStyle: Promise<StyleSpecification> | null = null

/** Custom-styled vector basemap, with a raster fallback. Reports the attribution to show. */
export function BaseMap({ onAttribution }: { onAttribution: (text: string) => void }) {
  const [state, setState] = useState<{ style: StyleSpecification } | 'loading' | 'fallback'>('loading')

  useEffect(() => {
    let cancelled = false
    cachedStyle ??= loadMapStyle()
    cachedStyle
      .then((style) => {
        if (cancelled) return
        setState({ style })
        onAttribution(VECTOR_ATTRIBUTION)
      })
      .catch(() => {
        cachedStyle = null
        if (cancelled) return
        setState('fallback')
        onAttribution(FALLBACK_ATTRIBUTION)
      })
    return () => {
      cancelled = true
    }
  }, [onAttribution])

  if (state === 'loading') return null
  if (state === 'fallback') return <TileLayer url={FALLBACK_TILES} maxZoom={19} />
  return <VectorLayer style={state.style} />
}
