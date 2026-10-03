import { BrowserRouter, Route, Routes } from 'react-router'
import HoldPage from './pages/HoldPage'
import MapPage from './pages/MapPage'
import NotFoundPage from './pages/NotFoundPage'
import StaffPage from './pages/StaffPage'
import TapPage from './pages/TapPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/hold/:id" element={<HoldPage />} />
        <Route path="/t/:shelterId/:action" element={<TapPage />} />
        <Route path="/staff/:shelterId" element={<StaffPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
