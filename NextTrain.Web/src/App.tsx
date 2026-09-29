import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { TLogo } from './components'
import LinePage from './pages/LinePage'
import LinesPage from './pages/LinesPage'
import MapPage from './pages/MapPage'
import StationPage from './pages/StationPage'

export default function App() {
  return (
    <BrowserRouter>
      <header className="sticky top-0 z-10 bg-neutral-900 text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-3">
            <TLogo />
            <span className="text-xl font-bold tracking-tight">NextTrain</span>
          </Link>
          <Link to="/map" className="ml-auto font-semibold hover:underline">
            Map
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        <Routes>
          <Route path="/" element={<LinesPage />} />
          <Route path="/lines/:routeId" element={<LinePage />} />
          <Route path="/stations/:stopId" element={<StationPage />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
