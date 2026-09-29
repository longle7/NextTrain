import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ApiError, stationRouteIds, type Route, type Station } from './api'

/** The MBTA "T" roundel. */
export function TLogo() {
  return (
    <span className="grid size-8 place-items-center rounded-full border-2 border-white text-lg leading-none font-bold">
      T
    </span>
  )
}

/** Colored line pill, e.g. "RL" in red. Gray until routes load. */
export function LineBadge({ routeId, routes }: { routeId: string; routes: Route[] | undefined }) {
  const route = routes?.find((r) => r.id.startsWith(routeId)) // 'Green' matches any branch
  const label = routeId.startsWith('Green-') ? `GL ${routeId.slice(6)}` : routeId === 'Mattapan' ? 'M' : `${routeId[0]}L`
  return (
    <span
      className="inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-full bg-mbta-silver px-2 text-xs font-bold whitespace-nowrap text-white"
      style={route && { backgroundColor: route.color, color: route.textColor }}
      title={route?.name ?? routeId}
    >
      {label}
    </span>
  )
}

export function Card({ children, to }: { children: ReactNode; to?: string }) {
  const className = 'block rounded-xl bg-white p-4 shadow-sm dark:bg-neutral-900'
  return to ? (
    <Link to={to} className={`${className} transition hover:shadow-md active:scale-[0.99]`}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  )
}

export function Status({ error, loading }: { error?: Error; loading?: boolean }) {
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
        <p>{friendlyError(error)}</p>
        <button onClick={() => location.reload()} className="shrink-0 rounded-lg bg-red-900/10 px-3 py-2 font-semibold dark:bg-white/10">
          Try again
        </button>
      </div>
    )
  }
  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-200 dark:bg-neutral-800" />
        ))}
      </div>
    )
  }
  return null
}

function friendlyError(error: Error): string {
  const status = error instanceof ApiError ? error.status : undefined
  if (!navigator.onLine) return "You're offline. Check your connection and try again."
  if (status === 503) return 'MBTA live data is temporarily unavailable. Please try again in a moment.'
  if (status === 404) return "We couldn't find that. It may have moved or been removed."
  return "Couldn't load this right now. Please try again."
}

/** A station's name and its line badges, linking to its departures. `hideRoute` drops the line you're already on. */
export function StationLink({ station, routes, hideRoute, detail }: {
  station: Station
  routes: Route[] | undefined
  hideRoute?: string
  detail?: ReactNode
}) {
  const transfers = stationRouteIds(station).filter((id) => id !== hideRoute)
  // Several Green branches read better as one "GL" badge.
  const greens = transfers.filter((id) => id.startsWith('Green-'))
  const badges = [...new Set(transfers.map((id) => (greens.length > 1 && id.startsWith('Green-') ? 'Green' : id)))]
  return (
    <Link to={`/stations/${station.mbtaStopId}`} className="flex min-h-11 flex-1 items-center justify-between gap-2 py-1 hover:underline">
      <span>
        <span className="font-medium">{station.name}</span>
        {detail && <span className="block text-sm text-neutral-500">{detail}</span>}
      </span>
      <span className="flex flex-wrap justify-end gap-1">
        {badges.map((id) => (
          <LineBadge key={id} routeId={id} routes={routes} />
        ))}
      </span>
    </Link>
  )
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="flex items-center gap-2 rounded-xl bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-neutral-400 dark:bg-neutral-900">
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-none stroke-neutral-400 stroke-2" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      {/* text-base (16px) stops iOS Safari from zooming in on focus */}
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-h-12 w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
      />
    </label>
  )
}
