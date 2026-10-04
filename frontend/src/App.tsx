import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { PageShell } from './components/PageShell'
import { Skeleton } from './components/Status'
import { ToastProvider } from './components/Toast'
import { ShelterProvider } from './lib/shelterStore'
import NotFoundPage from './pages/NotFoundPage'

// Every screen is its own chunk: a tag tap or staff link never downloads the map (Leaflet +
// MapLibre), and the map never downloads the admin hub.
const MapPage = lazy(() => import('./pages/MapPage'))
const HoldPage = lazy(() => import('./pages/HoldPage'))
const TapPage = lazy(() => import('./pages/TapPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminVoicePage = lazy(() => import('./pages/AdminVoicePage'))
const AdminSmsPage = lazy(() => import('./pages/AdminSmsPage'))

function PageSkeleton() {
  return (
    <PageShell>
      <div className="grid gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-[240px] w-full rounded-[20px]" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
      </div>
    </PageShell>
  )
}

function MapSkeleton() {
  return <div className="h-dvh w-full bg-[#f2f5f4]" aria-busy="true" aria-label="Loading map" />
}

function Page({ children, fallback = <PageSkeleton /> }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </motion.div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      {/* keyed by path only, so ?shelter= changes on the map don't trigger a page transition */}
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Page fallback={<MapSkeleton />}><MapPage /></Page>} />
        <Route path="/hold/:id" element={<Page><HoldPage /></Page>} />
        <Route path="/t/:shelterId/:action" element={<Page><TapPage /></Page>} />
        <Route path="/staff/:shelterId" element={<Page><StaffPage /></Page>} />
        {/* Hidden test hub; the API returns 404 unless DEV_TOOLS_ENABLED=true */}
        <Route path="/admin" element={<Page><AdminPage /></Page>} />
        <Route path="/admin/voice" element={<Page><AdminVoicePage /></Page>} />
        <Route path="/admin/sms" element={<Page><AdminSmsPage /></Page>} />
        <Route path="*" element={<Page><NotFoundPage /></Page>} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ShelterProvider>
        <ToastProvider>
          <BrowserRouter>
            <AnimatedRoutes />
          </BrowserRouter>
        </ToastProvider>
      </ShelterProvider>
    </MotionConfig>
  )
}
