import { alertsFor, effectLabel, majorAlert } from '../alerts'
import { ALERTS_REFRESH_MS, getAlerts, getRoutes, type Alert } from '../api'
import { Card, Status, WarningIcon } from '../components'
import { usePolling, useTitle } from '../usePolling'

export default function LinesPage() {
  const routes = usePolling(getRoutes, 'routes')
  const alerts = usePolling(getAlerts, 'alerts', ALERTS_REFRESH_MS)
  useTitle('Subway lines')

  return (
    <>
      <h1 className="text-2xl font-bold">Subway lines</h1>
      <Status error={routes.error} loading={!routes.data} rows={8} /> {/* one per subway line */}
      <ul className="space-y-2">
        {routes.data?.map((route) => (
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
