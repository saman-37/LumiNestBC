import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

// LuminestBC's map look: OpenFreeMap "positron" vector tiles (free, no key), recoloured here.
// Tweak colours in MAP_COLORS; layer ids come from the positron style.
export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
export const VECTOR_ATTRIBUTION = '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'

export const MAP_COLORS = {
  land: '#F2F5F4',
  water: '#CFE8E1',
  park: '#D7EEE4',
  motorway: '#F6D365',
  motorwayCasing: '#EBC24E',
  major: '#FBE7A1',
  majorCasing: '#EED68A',
  minor: '#FFFFFF',
  minorCasing: '#E3E8E7',
  building: '#E8EDEC',
  buildingOutline: '#DFE5E4',
  label: '#5E6F73', // brief asked #6B7C80; darkened to match --text-muted (4.5:1)
  labelHalo: '#FFFFFF',
}

const C = MAP_COLORS
const BUILDING_MIN_ZOOM = 15

type Paint = Record<string, unknown>

/** Per-class road colour: trunk reads as a highway, primary/secondary warm yellow, tertiary white. */
const byClass = (trunk: string, major: string, other: string) => [
  'match',
  ['get', 'class'],
  'trunk',
  trunk,
  ['primary', 'secondary'],
  major,
  other,
]

const PAINT: Record<string, Paint> = {
  background: { 'background-color': C.land },
  park: { 'fill-color': C.park },
  landcover_wood: { 'fill-color': C.park },
  landuse_residential: { 'fill-color': C.land },
  water: { 'fill-color': C.water },
  waterway: { 'line-color': C.water },
  building: { 'fill-color': C.building, 'fill-outline-color': C.buildingOutline },
  road_area_pier: { 'fill-color': C.land },
  highway_path: { 'line-color': C.minorCasing },
  highway_minor: { 'line-color': C.minor, 'line-opacity': 1 },
  highway_major_casing: { 'line-color': byClass(C.motorwayCasing, C.majorCasing, C.minorCasing) },
  highway_major_inner: { 'line-color': byClass(C.motorway, C.major, C.minor) },
  highway_major_subtle: { 'line-color': C.majorCasing },
  highway_motorway_casing: { 'line-color': C.motorwayCasing },
  highway_motorway_inner: { 'line-color': C.motorway },
  highway_motorway_subtle: { 'line-color': C.motorwayCasing },
  highway_motorway_bridge_casing: { 'line-color': C.motorwayCasing },
  highway_motorway_bridge_inner: { 'line-color': C.motorway },
  tunnel_motorway_casing: { 'line-color': C.motorwayCasing },
  tunnel_motorway_inner: { 'line-color': C.major },
}

// Clutter we don't want on a calm map.
const HIDDEN = new Set([
  'airport',
  'highway-shield-non-us',
  'highway-shield-us-interstate',
  'road_shield_us',
  'aeroway-taxiway',
  'boundary_3',
])

/** White streets get a thin grey casing so they read on the light land colour. */
const MINOR_CASING: LayerSpecification = {
  id: 'highway_minor_casing',
  type: 'line',
  source: 'openmaptiles',
  'source-layer': 'transportation',
  filter: [
    'all',
    ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
    ['match', ['get', 'class'], ['minor', 'service', 'track'], true, false],
  ],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': C.minorCasing,
    'line-width': ['interpolate', ['exponential', 1.55], ['zoom'], 13, 3, 20, 24],
  },
} as LayerSpecification

export function restyle(style: StyleSpecification): StyleSpecification {
  const layers: LayerSpecification[] = []
  for (const original of style.layers) {
    if (HIDDEN.has(original.id)) continue
    const layer = { ...original, paint: { ...(original as { paint?: Paint }).paint, ...PAINT[original.id] } } as LayerSpecification & { paint: Paint }
    if (layer.type === 'line') delete layer.paint['line-dasharray'] // solid casings
    if (layer.id === 'building') (layer as { minzoom?: number }).minzoom = BUILDING_MIN_ZOOM
    if (layer.type === 'symbol') {
      layer.paint['text-color'] = C.label
      layer.paint['text-halo-color'] = C.labelHalo
      layer.paint['text-halo-width'] = 1.2
      layer.paint['text-halo-blur'] = 0
    }
    if (layer.id === 'highway_minor') layers.push(MINOR_CASING)
    layers.push(layer)
  }
  return { ...style, layers }
}

/** Fetch positron and apply our colours. Rejects if OpenFreeMap is unreachable (caller falls back). */
export async function loadMapStyle(timeoutMs = 6000): Promise<StyleSpecification> {
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(STYLE_URL, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`style ${res.status}`)
    return restyle((await res.json()) as StyleSpecification)
  } finally {
    window.clearTimeout(timer)
  }
}
