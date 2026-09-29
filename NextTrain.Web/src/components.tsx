import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Route } from './api'

/** The MBTA "T" roundel. */
export function TLogo() {
  return (
    <span className="grid size-8 place-items-center rounded-full border-2 border-white text-lg leading-none font-bold">
      T
    </span>
  )
}

/** Colored line pill, e.g. "RL" in red. Gray until routes load. */
export function LineBadge({ routeId, routes, label: labelOverride }: { routeId: string; routes: Route[] | undefined; label?: string }) {
  const route = routes?.find((r) => r.id === routeId)
  const label = labelOverride ?? (routeId.startsWith('Green-') ? `GL ${routeId.slice(6)}` : routeId === 'Mattapan' ? 'M' : `${routeId[0]}L`)
  return (
    <span
      className="inline-flex h-6 min-w-9 items-center justify-center rounded-full bg-mbta-silver px-2 text-xs font-bold text-white"
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
      <p className="rounded-lg bg-red-100 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">
        Could not reach NextTrain: {error.message}
      </p>
    )
  }
  if (loading) return <p className="animate-pulse text-sm text-neutral-500">Loading...</p>
  return null
}
