import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router'
import { Brand, DemoBadge } from '../components/Brand'
import { FilterChips } from '../components/FilterChips'
import { lightIcon } from '../components/lightIcon'
import { ShelterDetailSheet } from '../components/ShelterDetailSheet'
import { ShelterList, type ListedShelter } from '../components/ShelterList'
import { WorkerPrompt } from '../components/WorkerPrompt'
import { api, ApiError } from '../lib/api'
import { DEFAULT_CENTRE, haversineKm, useMyLocation, type LatLng } from '../lib/geo'
import type { FilterKey } from '../lib/types'
import { useShelters } from '../lib/useShelters'
import { loadWorker, saveWorker, type Worker } from '../lib/worker'

// CARTO dark tiles need a free key (carto.com/basemaps). Without one, fall back to OSM
// tiles darkened with CSS so the map still works out of the box.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY
const TILES = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

/** Pans to the phone's location the first time it becomes known. */
function FollowFirstFix({ location }: { location: LatLng | null }) {
  const map = useMap()
  const done = useRef(false)
  useEffect(() => {
    if (location && !done.current) {
      done.current = true
      map.setView([location.lat, location.lng], 13)
    }
  }, [location, map])
  return null
}

export default function MapPage() {
  const navigate = useNavigate()
  const { shelters, loading, error, bumped } = useShelters()
  const location = useMyLocation()
  const origin = location ?? DEFAULT_CENTRE

  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [askWorker, setAskWorker] = useState(false)
  const [holding, setHolding] = useState(false)
  const [holdError, setHoldError] = useState<string | null>(null)

  const visible = useMemo(() => shelters.filter((s) => [...filters].every((f) => s[f])), [shelters, filters])
  const listed: ListedShelter[] = useMemo(
    () =>
      visible
        .filter((s) => !s.is_dv)
        .map((s) => ({ shelter: s, km: s.lat !== null && s.lng !== null ? haversineKm(origin, { lat: s.lat, lng: s.lng }) : null }))
        .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),
    [visible, origin],
  )
  const dv = visible.filter((s) => s.is_dv)
  const selected = listed.find((l) => l.shelter.id === selectedId) ?? null

  function toggleFilter(key: FilterKey) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function select(id: string | null) {
    setHoldError(null)
    setSelectedId(id)
  }

  async function hold(worker: Worker) {
    if (!selected) return
    setHolding(true)
    setHoldError(null)
    try {
      const { hold } = await api.createHold(selected.shelter.id, worker)
      navigate(`/hold/${hold.id}`)
    } catch (e) {
      setHoldError(
        e instanceof ApiError && e.code === 'just_taken'
          ? 'Just taken: someone else got the last bed. Try another shelter.'
          : "Couldn't place the hold. Check your connection and try again.",
      )
    } finally {
      setHolding(false)
    }
  }

  function requestHold() {
    const worker = loadWorker()
    if (worker) hold(worker)
    else setAskWorker(true)
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-night">
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        className="absolute inset-0 z-0 h-full w-full"
      >
        <TileLayer url={TILES} maxZoom={19} className={CARTO_KEY ? '' : 'tiles-darkened'} />
        <FollowFirstFix location={location} />
        {location && (
          <CircleMarker
            center={[location.lat, location.lng]}
            radius={7}
            pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#60a5fa', fillOpacity: 1 }}
          />
        )}
        {listed.map(({ shelter: s }) =>
          s.lat !== null && s.lng !== null ? (
            <Marker
              key={s.id}
              position={[s.lat, s.lng]}
              icon={lightIcon(s, bumped.has(s.id))}
              title={`${s.name}: ${s.open_beds} open beds`}
              eventHandlers={{ click: () => select(s.id) }}
            />
          ) : null,
        )}
      </MapContainer>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1000] bg-gradient-to-b from-night via-night/85 to-transparent pb-4 pt-[max(env(safe-area-inset-top),12px)]">
        <div className="pointer-events-auto flex items-start justify-between gap-3 px-4">
          <Brand />
          <DemoBadge />
        </div>
        <div className="pointer-events-auto mt-3">
          <FilterChips active={filters} onToggle={toggleFilter} />
        </div>
        {error && (
          <p role="status" className="pointer-events-auto mx-4 mt-2 rounded-xl border border-stale/50 bg-night/90 px-3 py-2 text-sm">
            {error}
          </p>
        )}
      </header>

      {selected ? (
        <ShelterDetailSheet
          shelter={selected.shelter}
          km={selected.km}
          bumped={bumped.has(selected.shelter.id)}
          holding={holding}
          error={holdError}
          onHold={requestHold}
          onClose={() => select(null)}
        />
      ) : (
        <ShelterList
          listed={listed}
          dv={dv}
          bumped={bumped}
          loading={loading}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          onSelect={select}
        />
      )}

      {askWorker && (
        <WorkerPrompt
          onSave={(worker) => {
            saveWorker(worker)
            setAskWorker(false)
            hold(worker)
          }}
          onCancel={() => setAskWorker(false)}
        />
      )}
    </div>
  )
}
