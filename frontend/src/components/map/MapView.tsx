import { divIcon, latLngBounds, type Map as LeafletMap } from 'leaflet'
import type { Ref } from 'react'
import { useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet'
import type { LatLng } from '../../lib/geo'
import type { Shelter } from '../../lib/types'
import { BaseMap } from './BaseMap'
import { ShelterMarker } from './ShelterMarker'


const SELECT_ZOOM = 16
const youIcon = divIcon({ className: 'you-marker', iconSize: [16, 16], iconAnchor: [8, 8], html: '<div class="you"></div>' })
const HOVER_DELAY_MS = 120

/** Pixels of map hidden behind floating UI. The map frames things inside what's left. */
export interface Insets {
  top: number
  bottom: number
  left: number
}

interface Props {
  shelters: Shelter[] // non-DV shelters with coordinates
  distances: Map<string, number | null>
  /** touch devices: no hover, so the selected pin shows its place card and sits lower in view */
  touch: boolean
  mapRef?: Ref<LeafletMap>
  onAttribution: (text: string) => void
  visibleIds: Set<string>
  selectedId: string | null
  bumped: Set<string>
  origin: LatLng
  originKey: number // bumps when the user searches / locates
  insets: Insets
  onSelect: (id: string) => void
  onClearSelection: () => void
}

function fitAll(map: LeafletMap, shelters: Shelter[], insets: Insets, animate: boolean, fallback: LatLng) {
  const points = shelters.filter((s) => s.lat !== null && s.lng !== null).map((s) => [s.lat!, s.lng!] as [number, number])
  if (!points.length) {
    map.setView([fallback.lat, fallback.lng], 13, { animate })
    return
  }
  const opts = {
    paddingTopLeft: [insets.left + 32, insets.top + 32] as [number, number],
    paddingBottomRight: [32, insets.bottom + 24] as [number, number],
    maxZoom: 15,
  }
  if (animate) map.flyToBounds(latLngBounds(points), { ...opts, duration: 0.9 })
  else map.fitBounds(latLngBounds(points), opts)
}

/**
 * Fly so the point lands inside the *visible* area, not under the sheet. yFraction places it
 * down the visible band (0.5 = middle); touch uses ~0.8 to leave room for the place card above.
 */
function flyToVisible(map: LeafletMap, target: LatLng, insets: Insets, animate: boolean, zoom = SELECT_ZOOM, yFraction = 0.5) {
  const size = map.getSize()
  const visibleX = (insets.left + size.x) / 2
  const visibleY = insets.top + (size.y - insets.bottom - insets.top) * yFraction
  const p = map.project([target.lat, target.lng], zoom)
  const center = map.unproject(p.add([size.x / 2 - visibleX, size.y / 2 - visibleY]), zoom)
  if (animate) map.flyTo(center, zoom, { duration: 0.9, easeLinearity: 0.35 })
  else map.setView(center, zoom, { animate: false })
}

function Controller({ shelters, visibleIds, selectedId, origin, originKey, insets, touch, onClearSelection }: Props) {
  const map = useMap()
  const reduce = useReducedMotion() ?? false
  const latest = useRef({ shelters, visibleIds, insets, origin })
  latest.current = { shelters, visibleIds, insets, origin }
  const fitted = useRef(false)
  const lastSelected = useRef<string | null>(null)
  const lastOrigin = useRef(originKey)

  const visibleShelters = () => {
    const { shelters, visibleIds } = latest.current
    const v = shelters.filter((s) => visibleIds.has(s.id))
    return v.length ? v : shelters
  }

  // First load: frame every shelter (or jump straight to a linked one).
  useEffect(() => {
    if (fitted.current || !shelters.length) return
    fitted.current = true
    const target = selectedId ? shelters.find((s) => s.id === selectedId) : null
    if (target?.lat != null && target.lng != null)
      flyToVisible(map, { lat: target.lat, lng: target.lng }, insets, false, SELECT_ZOOM, touch ? 0.78 : 0.5)
    else fitAll(map, visibleShelters(), insets, false, origin)
    lastSelected.current = selectedId
  })

  // Selection changes: fly in, or fly back out to everything.
  useEffect(() => {
    if (!fitted.current || selectedId === lastSelected.current) return
    lastSelected.current = selectedId
    const { shelters, insets, origin } = latest.current
    const target = selectedId ? shelters.find((s) => s.id === selectedId) : null
    if (target?.lat != null && target.lng != null)
      flyToVisible(map, { lat: target.lat, lng: target.lng }, insets, !reduce, SELECT_ZOOM, touch ? 0.78 : 0.5)
    else fitAll(map, visibleShelters(), insets, !reduce, origin)
  }, [selectedId, map, reduce, touch])

  // The list sheet was dragged to a new height: keep every light above it.
  const lastBottom = useRef(insets.bottom)
  useEffect(() => {
    if (!fitted.current || insets.bottom === lastBottom.current) return
    lastBottom.current = insets.bottom
    if (!latest.current.shelters.length || selectedId) return
    fitAll(map, visibleShelters(), insets, !reduce, latest.current.origin)
  }, [insets.bottom, selectedId, map, reduce])

  // New search area / located: go there.
  useEffect(() => {
    if (originKey === lastOrigin.current) return
    lastOrigin.current = originKey
    flyToVisible(map, origin, latest.current.insets, !reduce, 14)
  }, [originKey, origin, map, reduce])

  useMapEvents({
    click: () => {
      if (selectedId) onClearSelection()
    },
  })
  return null
}

export function MapView(props: Props) {
  const { shelters, visibleIds, selectedId, bumped, origin, distances, touch, mapRef, onSelect, onAttribution } = props
  const markers = useMemo(() => shelters.filter((s) => s.lat !== null && s.lng !== null), [shelters])

  // Hover place card: appears after a short delay, hides immediately on leave.
  const [hoverId, setHoverId] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const onHover = (id: string | null) => {
    window.clearTimeout(timer.current)
    if (id === null || touch) setHoverId(null)
    else timer.current = window.setTimeout(() => setHoverId(id), HOVER_DELAY_MS)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  return (
    <MapContainer
      ref={mapRef}
      center={[origin.lat, origin.lng]}
      zoom={13}
      zoomControl={false}
      attributionControl={false}
      className="absolute inset-0 z-0 h-full w-full"
    >
      <BaseMap onAttribution={onAttribution} />
      <Controller {...props} />
      <Marker position={[origin.lat, origin.lng]} icon={youIcon} interactive={false} keyboard={false} title="You are here" />
      {markers.map((s) => (
        <ShelterMarker
          key={s.id}
          shelter={s}
          hidden={!visibleIds.has(s.id)}
          dimmed={selectedId !== null}
          selected={s.id === selectedId}
          bumped={bumped.has(s.id)}
          km={distances.get(s.id) ?? null}
          showTip={hoverId === s.id || (touch && s.id === selectedId)}
          compactTip={touch}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </MapContainer>
  )
}
