import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from './components/Toast'
import { ShelterProvider } from './lib/shelterStore'
import AdminPage from './pages/AdminPage'
import AdminSmsPage from './pages/AdminSmsPage'
import AdminVoicePage from './pages/AdminVoicePage'
import HoldPage from './pages/HoldPage'
import MapPage from './pages/MapPage'
import NotFoundPage from './pages/NotFoundPage'
import StaffPage from './pages/StaffPage'
import TapPage from './pages/TapPage'

function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      {/* keyed by path only, so ?shelter= changes on the map don't trigger a page transition */}
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Page><MapPage /></Page>} />
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
