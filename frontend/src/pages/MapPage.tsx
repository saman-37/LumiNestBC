import type { Map as LeafletMap } from 'leaflet'
import { ArrowLeft, LocateFixed, Mic, Minus, Plus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AppHeader } from '../components/AppHeader'
import { BottomSheet, PEEK_HEIGHT, snapHeights, type Snap } from '../components/BottomSheet'
import { FilterBar, FilterSheet } from '../components/Filters'
import { MapView } from '../components/map/MapView'
import { SearchNear } from '../components/SearchNear'
import type { ListedShelter } from '../components/ShelterCard'
import { ShelterDetailView } from '../components/ShelterDetailView'
import { ListHeader, ShelterListView } from '../components/ShelterListView'
import { useToast } from '../components/Toast'
import { VoiceMatchSheet } from '../components/VoiceMatchSheet'
import { WeatherBanner } from '../components/WeatherBanner'
import { WorkerSheet } from '../components/WorkerSheet'
import { api, ApiError } from '../lib/api'
import { DEFAULT_AREA, findArea } from '../lib/areas'
import { useMediaQuery, useViewportHeight, vibrate } from '../lib/device'
import { hasBeds, isOpen, matchesFilters } from '../lib/filters'
import { geocodeAddress, getLocation, haversineKm, type LatLng } from '../lib/geo'
import { useShelterStore } from '../lib/shelterStore'
import type { FilterKey, Shelter } from '../lib/types'
import { loadWorker, saveWorker, type Worker } from '../lib/worker'

// Tier 3 wires this to /api/weather-layer.
const WEATHER_MODE = false
const DESKTOP_PANEL = 400
const DESKTOP_MARGIN = 24
// Mobile, shelter selected: header card + back pill take about this much of the top.
const SELECTED_TOP_INSET = 164

export default function MapPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const reduce = useReducedMotion()
  const { shelters, loading, error, bumped, upsert } = useShelterStore()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const touch = useMediaQuery('(hover: none)')
  const mapRef = useRef<LeafletMap>(null)
  const [attribution, setAttribution] = useState('')
  const vh = useViewportHeight()

  // ---- where we're searching from ----
  const [origin, setOrigin] = useState<LatLng>(DEFAULT_AREA)
  const [originLabel, setOriginLabel] = useState(DEFAULT_AREA.name)
  const [originKey, setOriginKey] = useState(0)
  const [locating, setLocating] = useState(false)

  // ---- filters ----
  const [filters, setFilters] = useState<Set<FilterKey>>(new Set())
  const [filterSheet, setFilterSheet] = useState(false)

  // ---- selection lives in the URL: /?shelter=<id> ----
  const [params, setParams] = useSearchParams()
  const selectedParam = params.get('shelter')

  // ---- holds ----
  const [holdingId, setHoldingId] = useState<string | null>(null)
  const [pendingHold, setPendingHold] = useState<Shelter | null>(null)
  const [justTakenId, setJustTakenId] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [voiceOpen, setVoiceOpen] = useState(false)

  // ---- layout measurements (so the map frames pins inside the visible area) ----
  const [snap, setSnap] = useState<Snap>('peek')
  const [sheetPx, setSheetPx] = useState(PEEK_HEIGHT)
  const topRef = useRef<HTMLDivElement>(null)
  const [topPx, setTopPx] = useState(200)

  useLayoutEffect(() => {
    const el = topRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setTopPx(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [desktop])

  // ---- derived lists ----
  const listedAll: ListedShelter[] = useMemo(
    () =>
      shelters
        .filter((s) => !s.is_dv)
        .map((s) => ({ shelter: s, km: s.lat !== null && s.lng !== null ? haversineKm(origin, { lat: s.lat, lng: s.lng }) : null }))
        .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity)),
    [shelters, origin],
  )
  const listed = useMemo(() => listedAll.filter((l) => matchesFilters(l.shelter, filters)), [listedAll, filters])
  // A "match" is a non-DV shelter matching the filters with at least one open bed.
  const openList = useMemo(() => listed.filter((l) => hasBeds(l.shelter)), [listed])
  const fullList = useMemo(() => listed.filter((l) => !hasBeds(l.shelter)), [listed])
  const dv = useMemo(() => shelters.filter((s) => s.is_dv && matchesFilters(s, filters)), [shelters, filters])
  const visibleIds = useMemo(() => new Set(listed.map((l) => l.shelter.id)), [listed]) // full matches stay as "Full" pins
  const mapShelters = useMemo(() => listedAll.map((l) => l.shelter), [listedAll])
  const distances = useMemo(() => new Map(listedAll.map((l) => [l.shelter.id, l.km])), [listedAll])
  const bestId = openList.find((l) => isOpen(l.shelter))?.shelter.id ?? null
  const matchCount = openList.length

  const selected = listedAll.find((l) => l.shelter.id === selectedParam) ?? null // DV can never be selected
  const selectedId = selected?.shelter.id ?? null
  const nextBest =
    selected && justTakenId === selectedId ? (openList.find((l) => isOpen(l.shelter) && l.shelter.id !== selectedId) ?? null) : null

  // ---- selection ----
  const select = useCallback(
    (id: string) => {
      if (id === selectedParam) return
      setJustTakenId(null)
      setParams({ shelter: id }) // pushes history, so Back deselects
    },
    [selectedParam, setParams],
  )
  const clearSelection = useCallback(() => {
    setJustTakenId(null)
    setParams({}, { replace: true })
  }, [setParams])

  useEffect(() => {
    setSnap(selectedId ? 'half' : 'peek')
  }, [selectedId])

  // Toasts float above the sheet on mobile.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--toast-bottom', desktop ? '24px' : `${sheetPx + 12}px`)
    return () => {
      root.style.removeProperty('--toast-bottom')
    }
  }, [sheetPx, desktop])

  // ---- search / locate ----
  // Known areas answer instantly; anything else (a street address, intersection or place) is geocoded.
  async function search(text: string) {
    // A house number means a real address ("10666 City Parkway, Surrey"): look it up first rather
    // than snapping to the area its city name matches.
    const looksLikeAddress = /\d/.test(text)
    const area = looksLikeAddress ? null : findArea(text)
    const place = area ?? (await geocodeAddress(text)) ?? (looksLikeAddress ? findArea(text) : null)
    if (!place) {
      toast(`Couldn't find "${text.trim()}". Try a street address, intersection or area like Metrotown.`, 'error')
      return
    }
    setOrigin({ lat: place.lat, lng: place.lng })
    setOriginLabel('label' in place ? place.label : place.name)
    setOriginKey((k) => k + 1)
  }

  async function locate() {
    setLocating(true)
    const here = await getLocation()
    setLocating(false)
    if (!here.ok) {
      const why = {
        insecure: 'Location only works on a secure (https) page.',
        denied: 'Location permission is off for this site.',
        unavailable: "Couldn't get your location.",
      }[here.reason]
      toast(`${why} Type an address or area instead.`, 'error')
      return
    }
    setOrigin(here.at)
    setOriginLabel('My location')
    setOriginKey((k) => k + 1)
  }

  // ---- filters ----
  function toggleFilter(key: FilterKey) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ---- hold flow ----
  async function hold(shelter: Shelter, worker: Worker) {
    setHoldingId(shelter.id)
    try {
      const res = await api.createHold(shelter.id, worker)
      vibrate(30)
      upsert(res.shelter) // count animates down before we leave
      toast('Bed held for 60 minutes', 'success')
      setTimeout(() => navigate(`/hold/${res.hold.id}`), reduce ? 0 : 550)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'just_taken') {
        vibrate([20, 40, 20])
        toast('Someone just took that bed', 'error')
        setJustTakenId(shelter.id)
        if (shelter.id !== selectedParam) setParams({ shelter: shelter.id })
        setShakeKey((k) => k + 1)
        api.shelter(shelter.id).then(upsert).catch(() => {})
      } else if (e instanceof ApiError && e.code === 'not_accepting') {
        toast("This shelter isn't accepting new people tonight", 'error')
        api.shelter(shelter.id).then(upsert).catch(() => {})
      } else {
        toast("Couldn't place the hold. Check your connection and try again.", 'error')
      }
    } finally {
      setHoldingId(null)
    }
  }

  // Stable identity (reads the latest state through a ref) so memoised list cards skip re-renders.
  const requestHoldRef = useRef((shelter: Shelter) => {
    void shelter
  })
  // Every hold asks who's holding (pre-filled with the last name used), so a shared phone or a
  // second worker can change it each time.
  requestHoldRef.current = (shelter: Shelter) => setPendingHold(shelter)
  const requestHold = useCallback((shelter: Shelter) => requestHoldRef.current(shelter), [])

  // ---- pieces ----
  const heights = snapHeights(vh, topPx)
  const insets = desktop
    ? { top: 0, bottom: 0, left: DESKTOP_PANEL + DESKTOP_MARGIN * 2 }
    : { top: selectedId ? SELECTED_TOP_INSET : topPx, bottom: selectedId ? heights.half + 40 : Math.min(sheetPx, heights.half) + 40, left: 0 }

  const controls = (
    <>
      <SearchNear
        label={originLabel}
        locating={locating}
        onSearch={search}
        onLocate={locate}
        onFocus={() => !desktop && setSnap('peek')} // keep the field and suggestions above the keyboard
        onVoiceMatch={() => setVoiceOpen(true)}
      />
      <FilterBar active={filters} onToggle={toggleFilter} onOpenSheet={() => setFilterSheet(true)} />
      <div className="px-4 pb-3 pt-1 empty:hidden">
        {WEATHER_MODE && <WeatherBanner />}
        {error && (
          <p role="status" className="rounded-[12px] border border-red-tint-border bg-red-tint px-3 py-2 text-[13px] font-medium text-red-text">
            {error}
          </p>
        )}
      </div>
    </>
  )

  const backPill = (
    <motion.button
      type="button"
      onClick={clearSelection}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-[15px] font-semibold text-text shadow-[var(--shadow-float)] hover:bg-surface-2"
    >
      <ArrowLeft aria-hidden size={18} /> All shelters
    </motion.button>
  )

  const listView = (
    <ShelterListView
      open={openList}
      full={fullList}
      dv={dv}
      loading={loading}
      bestId={bestId}
      holdingId={holdingId}
      filtersActive={filters.size > 0}
      nearestOverall={listedAll[0] ?? null}
      onSelect={select}
      onHold={requestHold}
      onClearFilters={() => setFilters(new Set())}
    />
  )

  const detailView = selected && (
    <ShelterDetailView
      key={selected.shelter.id}
      shelter={selected.shelter}
      km={selected.km}
      holding={holdingId === selected.shelter.id}
      shakeKey={shakeKey}
      nextBest={nextBest}
      onHold={requestHold}
      onSelect={select}
    />
  )

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={selectedId ?? 'list'}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.18 }}
      >
        {selected ? detailView : listView}
      </motion.div>
    </AnimatePresence>
  )

  const ctrlBtn =
    'grid h-11 w-11 place-items-center rounded-[10px] border border-border bg-surface text-text shadow-[var(--shadow-float)] hover:bg-surface-2'
  const mapControls = (
    <div
      className="absolute top-0 right-3 z-[950] flex flex-col gap-2 transition-transform duration-300 will-change-transform"
      style={{ transform: `translateY(${desktop ? DESKTOP_MARGIN : topPx + 12}px)`, right: desktop ? DESKTOP_MARGIN : 12 }}
    >
      <button
        type="button"
        aria-label="Voice bed match"
        title="Voice bed match"
        onClick={() => setVoiceOpen(true)}
        className={`${ctrlBtn} border-green-tint-border bg-green-tint text-green-strong hover:bg-green-tint/80`}
      >
        <Mic aria-hidden size={20} />
      </button>
      <button type="button" aria-label="Show my location" onClick={locate} disabled={locating} className={`${ctrlBtn} text-blue`}>
        <LocateFixed aria-hidden size={20} className={locating ? 'animate-pulse' : ''} />
      </button>
      <button type="button" aria-label="Zoom in" onClick={() => mapRef.current?.zoomIn()} className={ctrlBtn}>
        <Plus aria-hidden size={20} />
      </button>
      <button type="button" aria-label="Zoom out" onClick={() => mapRef.current?.zoomOut()} className={ctrlBtn}>
        <Minus aria-hidden size={20} />
      </button>
    </div>
  )

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <MapView
          shelters={mapShelters}
          distances={distances}
          visibleIds={visibleIds}
          selectedId={selectedId}
          bumped={bumped}
          origin={origin}
          originKey={originKey}
          insets={insets}
          touch={touch}
          mapRef={mapRef}
          onSelect={select}
          onClearSelection={clearSelection}
          onAttribution={setAttribution}
        />
      </div>

      {(desktop || !selected) && mapControls}

      {desktop ? (
        <>
          <div className="pointer-events-none absolute bottom-3 z-[900] flex items-center gap-2" style={{ left: DESKTOP_PANEL + DESKTOP_MARGIN * 2 }}>
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-green-tint-border bg-surface px-3 py-1 text-[13px] font-bold text-green-strong shadow-[var(--shadow-float)] hover:bg-green-tint active:scale-95"
            >
              <Mic size={15} />
              <span>Voice Match</span>
            </button>
          </div>
          {attribution && (
            <span className="pointer-events-none absolute bottom-2 right-2 z-[900] rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] text-text-muted">
              {attribution}
            </span>
          )}
        </>
      ) : (
        <div
          className="pointer-events-none absolute inset-x-3 bottom-0 z-[900] flex items-center justify-between gap-1 transition-transform duration-300"
          style={{ transform: `translateY(-${sheetPx + 8}px)` }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-green-tint-border bg-surface px-3 py-1 text-[13px] font-bold text-green-strong shadow-[var(--shadow-float)] hover:bg-green-tint active:scale-95"
            >
              <Mic size={15} />
              <span>Voice Match</span>
            </button>
          </div>
          {attribution && (
            <span className="max-w-full rounded-md bg-surface/85 px-1.5 py-0.5 text-[10px] text-text-muted">{attribution}</span>
          )}
        </div>
      )}

      {desktop && (
        <aside
          style={{ width: DESKTOP_PANEL, top: DESKTOP_MARGIN, bottom: DESKTOP_MARGIN, left: DESKTOP_MARGIN }}
          className="absolute z-[1000] flex flex-col overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-float)]"
        >
          <AppHeader variant="solid" />
          {!selected && <div className="border-b border-border pb-1">{controls}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            {selected ? <div className="pb-3 pt-4">{backPill}</div> : <div className="pt-3"><ListHeader count={matchCount} loading={loading} /></div>}
            {content}
          </div>
        </aside>
      )}

      {!desktop && (
        <>
          <div ref={topRef} className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-3 pt-[max(env(safe-area-inset-top),12px)]">
            <div className="pointer-events-auto overflow-hidden rounded-[20px] bg-surface shadow-[var(--shadow-float)]">
              <AppHeader variant="bare" />
              <AnimatePresence initial={false}>
                {!selected && (
                  <motion.div
                    key="controls"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    {controls}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <AnimatePresence>{selected && <div className="pt-3">{backPill}</div>}</AnimatePresence>
          </div>

          <BottomSheet
            label={selected ? `${selected.shelter.name} details` : 'Nearby shelters'}
            reserveTop={topPx}
            snap={snap}
            onSnap={setSnap}
            onDismiss={selected ? clearSelection : undefined}
            onHeightChange={setSheetPx}
            header={selected ? null : <ListHeader count={matchCount} loading={loading} />}
          >
            {content}
          </BottomSheet>
        </>
      )}

      <FilterSheet
        open={filterSheet}
        active={filters}
        resultCount={matchCount}
        onToggle={toggleFilter}
        onClear={() => setFilters(new Set())}
        onClose={() => setFilterSheet(false)}
      />
      <WorkerSheet
        open={pendingHold !== null}
        shelterName={pendingHold?.name ?? null}
        initial={pendingHold ? loadWorker() : null}
        onClose={() => setPendingHold(null)}
        onSave={(worker) => {
          saveWorker(worker)
          const shelter = pendingHold
          setPendingHold(null)
          if (shelter) hold(shelter, worker)
        }}
      />
      <VoiceMatchSheet
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        coords={origin ? { lat: origin.lat, lng: origin.lng } : null}
        onSelectShelter={select}
        onHoldShelter={requestHold}
      />
    </div>
  )
}
