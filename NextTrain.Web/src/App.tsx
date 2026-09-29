import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { TLogo } from './components'
import CommutePage from './pages/CommutePage'
import HomePage from './pages/HomePage'
import LinePage from './pages/LinePage'
import LinesPage from './pages/LinesPage'
import MapPage from './pages/MapPage'
import StationPage from './pages/StationPage'

const TABS = ['/', '/lines', '/map']

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      {/* Bottom padding keeps the last item clear of the tab bar and the iPhone home indicator. */}
      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lines" element={<LinesPage />} />
          <Route path="/lines/:routeId" element={<LinePage />} />
          <Route path="/stations/:stopId" element={<StationPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/commutes/new" element={<CommutePage />} />
          <Route path="/commutes/:id" element={<CommutePage />} />
        </Routes>
      </main>
      <TabBar />
    </BrowserRouter>
  )
}

// Tab pages show the logo; deeper pages get a Back button (an installed app has no browser back button).
function Header() {
  const location = useLocation()
  const navigate = useNavigate()

  // BrowserRouter keeps the old scroll position between pages; start each page at the top.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-10 bg-neutral-900 pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto flex min-h-14 max-w-xl items-center gap-3 px-4">
        {TABS.includes(location.pathname) ? (
          <Link to="/" className="flex items-center gap-3">
            <TLogo />
            <span className="text-xl font-bold tracking-tight">NextTrain</span>
          </Link>
        ) : (
          <button
            // Opened from a link or bookmark there's no history to go back to, so go Home.
            onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
            className="-ml-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-lg font-semibold"
          >
            <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-[2.5]" aria-hidden>
              <path d="m15 5-7 7 7 7" />
            </svg>
            Back
          </button>
        )}
      </div>
    </header>
  )
}

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
      <div className="mx-auto grid max-w-xl grid-cols-3">
        <Tab to="/" label="Home" icon={<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />} />
        <Tab to="/lines" label="Lines" icon={<path d="M5 6h14M5 12h14M5 18h14" />} />
        <Tab to="/map" label="Map" icon={<path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zm0 0v14m6-12v14" />} />
      </div>
    </nav>
  )
}

function Tab({ to, label, icon }: { to: string; label: string; icon: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-400'}`
      }
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2 [stroke-linejoin:round]" aria-hidden>
        {icon}
      </svg>
      {label}
    </NavLink>
  )
}
