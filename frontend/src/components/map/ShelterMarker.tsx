import { divIcon, type Marker as LeafletMarker } from 'leaflet'
import { memo, useEffect, useMemo, useRef } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import { bedsWord, shelterState, type ShelterState } from '../../lib/filters'
import type { Shelter } from '../../lib/types'
import { PinTooltip } from './PinTooltip'

function pinLabel(state: ShelterState, beds: number, accepting: boolean): string {
  if (!accepting) return 'Closed'
  if (state === 'full') return 'Full'
  return String(beds)
}

function pinTitle(s: Shelter, state: ShelterState): string {
  if (state === 'full') return `${s.name}: full`
  return `${s.name}: ${s.open_beds} ${bedsWord(s.open_beds)} open`
}

interface Props {
  shelter: Shelter
  hidden: boolean
  dimmed: boolean
  selected: boolean
  bumped: boolean
  /** show the dark place card above the pin (hover on desktop, selected on touch) */
  showTip: boolean
  /** touch: smaller card (the sheet below already shows the details) */
  compactTip: boolean
  km: number | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

/**
 * A shelter drawn as a light. The icon's HTML only changes when the count/state changes
 * (which replays the pop + ripple); selection, dimming and filtering toggle classes on the
 * existing element so they can transition smoothly instead of popping.
 */
export const ShelterMarker = memo(function ShelterMarker({ shelter, hidden, dimmed, selected, bumped, showTip, compactTip, km, onSelect, onHover }: Props) {
  const ref = useRef<LeafletMarker>(null)
  const state = shelterState(shelter)
  const label = pinLabel(state, shelter.open_beds, shelter.accepting)
  const title = pinTitle(shelter, state)

  // Event handlers stay the same object so react-leaflet doesn't rebind them on every render.
  const handlers = useMemo(
    () => ({
      click: () => onSelect(shelter.id),
      mouseover: () => !hidden && onHover(shelter.id),
      mouseout: () => onHover(null),
    }),
    [onSelect, onHover, shelter.id, hidden],
  )

  const icon = useMemo(
    () =>
      divIcon({
        className: 'pin-marker',
        iconSize: [56, 56],
        iconAnchor: [28, 28],
        html:
          `<div class="pin pin--${state}${bumped ? ' pin--pop' : ''}">` +
          `<span class="pin__glow"></span><span class="pin__ring"></span>` +
          `<span class="pin__body">${label}</span></div>`,
      }),
    [state, label, bumped],
  )

  useEffect(() => {
    const el = ref.current?.getElement()
    if (!el) return
    el.classList.toggle('is-hidden', hidden && !selected)
    el.classList.toggle('is-dimmed', dimmed && !selected)
    el.classList.toggle('is-selected', selected)
    el.tabIndex = hidden && !selected ? -1 : 0
    el.setAttribute('aria-hidden', String(hidden && !selected))
    // Leaflet only applies `alt` to image icons; our pins are divs with role="button", so name them here.
    el.setAttribute('aria-label', title)
  }, [icon, hidden, dimmed, selected, title])

  if (shelter.lat === null || shelter.lng === null) return null
  return (
    <Marker
      ref={ref}
      position={[shelter.lat, shelter.lng]}
      icon={icon}
      alt={title}
      zIndexOffset={selected ? 1000 : state === 'open' ? 200 : 0}
      eventHandlers={handlers}
    >
      {showTip && !hidden && (
        <Tooltip permanent direction="top" offset={[0, -24]} opacity={1} className="pin-tip">
          <PinTooltip shelter={shelter} km={km} compact={compactTip} />
        </Tooltip>
      )}
    </Marker>
  )
})
