import { Component, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useOnline, useTitle } from './usePolling'
import { MAJOR_SEVERITY } from './alerts'
import { ApiError, stationRouteIds, type Alert, type Route, type Station } from './api'

/** Full-width main action ("Save commute"). Works on <button> and <Link>. */
export const primaryButton =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 font-semibold text-white transition active:opacity-80 disabled:opacity-40 dark:bg-white dark:text-neutral-900'
/** Text action in the tint color ("Edit", "+ Add"). */
export const linkButton = 'flex min-h-11 items-center px-2 font-semibold text-blue-600 active:opacity-60 dark:text-blue-400'
/** Compact action beside others ("Directions", "Add commute"). */
export const secondaryButton =
  'flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold shadow-sm active:opacity-70 dark:bg-neutral-900'
/** Destructive action ("Delete commute"). */
export const dangerButton =
  'flex min-h-12 w-full items-center justify-center rounded-xl font-semibold text-red-600 active:opacity-60 disabled:opacity-40 dark:text-red-400'

/** NextTrain's own mark (public/favicon.svg): not the MBTA's "T", which is their trademark. */
export function AppLogo() {
  return <img src="/favicon.svg" alt="" className="size-8" />
}

/** Colored line pill, e.g. "RL" in red. Gray until routes load. Screen readers hear the full line name. */
export function LineBadge({ routeId, routes }: { routeId: string; routes: Route[] | undefined }) {
  const route = routes?.find((r) => r.id.startsWith(routeId)) // 'Green' matches any branch
  const label = routeId.startsWith('Green-') ? `GL ${routeId.slice(6)}` : routeId === 'Mattapan' ? 'M' : `${routeId[0]}L`
  const name = routeId === 'Green' ? 'Green Line' : (route?.name ?? routeId)
  return (
    <span
      className="inline-flex h-6 min-w-9 shrink-0 items-center justify-center rounded-full bg-mbta-silver px-2 text-xs font-bold whitespace-nowrap text-white"
      style={route && { backgroundColor: route.color, color: route.textColor }}
      title={name}
    >
      <span aria-hidden>{label}</span>
      <span className="sr-only">{name}</span>
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

/** An error box with a way out, or `rows` placeholder cards while loading. */
export function Status({ error, loading, rows = 3 }: { error?: Error; loading?: boolean; rows?: number }) {
  const online = useOnline()
  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
        {/* Offline, a reload would only show the browser's error page; data refreshes by itself once back online. */}
        <p>{online ? friendlyError(error) : "You're offline. NextTrain will refresh when you're back online."}</p>
        {online && (
          <button onClick={() => location.reload()} className="shrink-0 rounded-lg bg-red-900/10 px-3 py-2 font-semibold dark:bg-white/10">
            Try again
          </button>
        )}
      </div>
    )
  }
  if (loading) {
    return (
      <div className="space-y-2" role="status" aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-16 rounded-xl bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800" />
        ))}
      </div>
    )
  }
  return null
}

function friendlyError(error: Error): string {
  const status = error instanceof ApiError ? error.status : undefined
  if (status === 0) return error.message // timed out or no connection: api.ts wrote it for people
  if (status === 503) return 'MBTA live data is temporarily unavailable. Please try again in a moment.'
  if (status === 429) return 'Too many requests right now. Please wait a moment and try again.'
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
        {station.isAccessible && (
          <span className="ml-1.5 inline-flex align-[-2px] text-blue-600 dark:text-blue-400">
            <AccessibleIcon className="size-4" />
            <span className="sr-only">, wheelchair accessible</span>
          </span>
        )}
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

/** Search box. The keyboard's Search key (Enter) calls `onSubmit`, e.g. to open the top result. */
export function SearchInput({ value, onChange, placeholder, onSubmit }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  onSubmit?: () => void
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      className="flex items-center gap-2 rounded-xl bg-white px-3 shadow-sm focus-within:ring-2 focus-within:ring-blue-600 dark:bg-neutral-900 dark:focus-within:ring-blue-400"
    >
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
        enterKeyHint="search"
        className="min-h-12 w-full bg-transparent text-base outline-none placeholder:text-neutral-400"
      />
    </form>
  )
}

/** A service alert: its short summary and timeframe, tap to read the details. Major ones are amber. */
export function AlertBanner({ alert }: { alert: Alert }) {
  const major = alert.severity >= MAJOR_SEVERITY
  return (
    <details
      className={`group rounded-xl p-4 ${major ? 'bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-50' : 'bg-white shadow-sm dark:bg-neutral-900'}`}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
        <WarningIcon className={`mt-0.5 size-5 shrink-0 ${major ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-500'}`} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{alert.summary}</span>
          {alert.timeframe && <span className="block text-sm opacity-75">{capitalize(alert.timeframe)}</span>}
        </span>
        <svg viewBox="0 0 24 24" className="mt-0.5 size-5 shrink-0 fill-none stroke-current stroke-2 opacity-60 transition group-open:rotate-180" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="mt-3 space-y-2 pl-8 text-sm whitespace-pre-line">
        <p>{alert.header}</p>
        {alert.description && <p className="opacity-80">{alert.description}</p>}
        {alert.url && (
          <a href={alert.url} target="_blank" rel="noreferrer" className="inline-block font-semibold underline">
            More details<span className="sr-only"> about this alert (opens the MBTA website)</span>
          </a>
        )}
      </div>
    </details>
  )
}

/** Wheelchair access symbol (drawn for NextTrain). */
export function AccessibleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round] ${className ?? ''}`} aria-hidden>
      <circle cx="12" cy="4" r="1.6" className="fill-current stroke-none" />
      <path d="M12 7.5v5h5l2.5 5.5M12 10h4M8.5 11.2a5 5 0 1 0 6.3 6.3" />
    </svg>
  )
}

export function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`fill-current ${className ?? ''}`} aria-hidden>
      <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1zm0 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  )
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Catches a crash anywhere below it and offers a reload instead of a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  // Going Home clears it: App keys this boundary by page.
  render() {
    return this.state.crashed ? (
      <NotFound title="Something went wrong" message="NextTrain hit an unexpected problem. Going back to Home usually fixes it." />
    ) : (
      this.props.children
    )
  }
}

/** A missing page, line, or station: says so plainly and offers a way on (Home, or `back` like "All lines"). */
export function NotFound({
  title = 'Page not found',
  message = "This page doesn't exist. It may have moved.",
  back,
}: {
  title?: string
  message?: string
  back?: { to: string; label: string }
}) {
  useTitle(title)
  return (
    <div className="space-y-4 pt-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-neutral-500">{message}</p>
      <Link to={back?.to ?? '/'} className={primaryButton}>
        {back?.label ?? 'Go to Home'}
      </Link>
    </div>
  )
}

/** A gray bar where text will appear once it loads (e.g. a station's name); screen readers hear "Loading". */
export function LoadingText({ className }: { className: string }) {
  return (
    <span role="status" aria-label="Loading" className={`inline-block rounded-md bg-neutral-200 align-middle motion-safe:animate-pulse dark:bg-neutral-800 ${className}`} />
  )
}
