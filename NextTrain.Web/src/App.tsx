import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { TLogo } from './components'
import LinePage from './pages/LinePage'
import LinesPage from './pages/LinesPage'
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
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        <Routes>
          <Route path="/" element={<LinesPage />} />
          <Route path="/lines/:routeId" element={<LinePage />} />
          <Route path="/stations/:stopId" element={<StationPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}
