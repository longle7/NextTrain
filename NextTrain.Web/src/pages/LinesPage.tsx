import { useState } from 'react'
import { useNavigate } from 'react-router'
import { alertsFor, effectLabel, majorAlert } from '../alerts'
import { ALERTS_REFRESH_MS, getAlerts, getRoutes, ROUTES, searchRoutes, type Alert } from '../api'
import { Card, LineBadge, SearchInput, Status, WarningIcon } from '../components'
import { failure, usePolling, useTitle } from '../usePolling'

export default function LinesPage() {
  const routes = usePolling(getRoutes, ROUTES)
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  useTitle('Lines')
  const subway = routes.data?.filter((r) => r.type === 'subway')
  const buses = routes.data?.filter((r) => r.type === 'bus') ?? []
  // All ~150 bus routes, Silver Line first (MBTA's order), or the ones matching a number or place.
  const shownBuses = query.trim() ? searchRoutes(buses, query, buses.length) : buses

  return (
    <>
      <h1 className="text-2xl font-bold">Lines</h1>
      <h2 className="px-1 text-lg font-bold">Subway</h2>
      <Status error={failure(routes)} loading={!routes.data} rows={8} /> {/* one per subway line */}
      <ul className="space-y-2">
        {subway?.map((route) => (
          <li key={route.id}>
            <Card to={`/lines/${route.id}`}>
              <div className="flex items-center gap-3">
                <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: route.color }} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{route.name}</div>
                  <div className="text-sm text-neutral-500">{route.directionDestinations.join(' – ')}</div>
                </div>
                {/* No status until alerts load: an unknown status must not read as "Normal service". */}
                {alerts.data && <LineStatus alert={majorAlert(alertsFor(alerts.data, { routeIds: [route.id] }))} />}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {routes.data && (
        <section className="space-y-2">
          <h2 className="px-1 pt-2 text-lg font-bold">Buses</h2>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Find a bus route, e.g. 66 or SL1"
            onSubmit={() => shownBuses[0] && navigate(`/lines/${shownBuses[0].id}`)}
          />
          {query.trim() && shownBuses.length === 0 && <p className="px-1 text-neutral-500">No bus route matches “{query.trim()}”.</p>}
          <ul className="space-y-2">
            {shownBuses.map((route) => (
              <li key={route.id}>
                <Card to={`/lines/${route.id}`}>
                  <span className="flex items-center gap-3">
                    <LineBadge routeId={route.id} routes={routes.data} />
                    <span className="min-w-0 flex-1 truncate font-medium">{route.name}</span>
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

function LineStatus({ alert }: { alert: Alert | undefined }) {
  return alert ? (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <WarningIcon className="size-4" />
      {effectLabel(alert.effect)}
    </span>
  ) : (
    <span className="shrink-0 text-xs font-semibold text-green-700 dark:text-green-400">Normal service</span>
  )
}
