import { divIcon, type DivIcon } from 'leaflet'
import { lightLevel } from '../lib/filters'
import type { Shelter } from '../lib/types'

/** A shelter drawn as a light: warm glow for open beds, unlit grey when full. Number always shown. */
export function lightIcon(shelter: Shelter, bumped: boolean): DivIcon {
  const beds = shelter.is_full ? 0 : shelter.open_beds
  const level = lightLevel(shelter.open_beds, shelter.is_full)
  return divIcon({
    className: 'light-icon',
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    html: `<div class="light-pin light-${level}${bumped ? ' light-bump' : ''}"><span class="light-glow"></span><span class="light-core">${beds}</span></div>`,
  })
}
