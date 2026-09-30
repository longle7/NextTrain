import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { AppLogo, ErrorBoundary, NotFound, Status } from './components'
import { useOnline } from './usePolling'
import CommutePage from './pages/CommutePage'
import HomePage from './pages/HomePage'
import LinePage from './pages/LinePage'
import LinesPage from './pages/LinesPage'
import PrivacyPage from './pages/PrivacyPage'
import SettingsPage from './pages/SettingsPage'
import StationPage from './pages/StationPage'

// The map loads Apple's MapKit JS (about 240 KB), so it loads only when opened: a faster first launch.
const MapPage = lazy(() => import('./pages/MapPage'))

const TABS = ['/', '/lines', '/map']

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      {/* Bottom padding keeps the last item clear of the tab bar and the iPhone home indicator. */}
      {/* Focusable (but not tabbable) so navigation can move focus here; see Header. */}
      <main tabIndex={-1} className="mx-auto max-w-xl space-y-4 px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] outline-none">
        <Pages />
      </main>
      <TabBar />
    </BrowserRouter>
  )
}

function Pages() {
  const { pathname } = useLocation()
  return (
    // Keyed by page so moving to another page clears a crash.
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<Status loading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/lines" element={<LinesPage />} />
          <Route path="/lines/:routeId" element={<LinePage />} />
          <Route path="/stations/:stopId" element={<StationPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/commutes/new" element={<CommutePage />} />
          <Route path="/commutes/:id" element={<CommutePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

// Tab pages show the logo; deeper pages get a Back button (an installed app has no browser back button).
function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const online = useOnline()
  const firstPage = useRef(true)

  // BrowserRouter keeps the old scroll position between pages; start each page at the top. After navigating,
  // move focus to the new page so VoiceOver reads it rather than staying on the link that just disappeared.
  useEffect(() => {
    window.scrollTo(0, 0)
    if (firstPage.current) {
      firstPage.current = false
      return
    }
    document.querySelector('main')?.focus({ preventScroll: true })
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-10 bg-neutral-900 pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto flex min-h-14 max-w-xl items-center justify-between gap-3 px-4">
        {TABS.includes(location.pathname) ? (
          <>
            <Link to="/" className="flex items-center gap-2.5">
              <AppLogo />
              <span className="text-xl font-bold tracking-tight">NextTrain</span>
            </Link>
            <Link to="/settings" aria-label="Settings" className="-mr-2 grid size-11 place-items-center rounded-full active:bg-white/10">
              <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </>
        ) : (
          <button
            // Opened from a link or bookmark there's no history to go back to, so go Home.
            onClick={() => (location.key === 'default' ? navigate('/') : navigate(-1))}
            className="-ml-2 flex min-h-11 items-center gap-1 rounded-lg px-2 text-lg font-semibold active:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-[2.5]" aria-hidden>
              <path d="m15 5-7 7 7 7" />
            </svg>
            Back
          </button>
        )}
      </div>
      {/* In the header so it stays in view on every page while offline (a common moment in the subway). */}
      {!online && (
        <p role="status" className="bg-amber-400 px-4 py-1.5 text-center text-sm font-semibold text-neutral-900">
          You're offline. Times shown may be out of date.
        </p>
      )}
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
        `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-neutral-900 dark:text-white' : 'text-neutral-500 dark:text-neutral-400'}`
      }
    >
      <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current stroke-2 [stroke-linejoin:round]" aria-hidden>
        {icon}
      </svg>
      {label}
    </NavLink>
  )
}
