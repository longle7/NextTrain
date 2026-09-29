import { useEffect, useState } from 'react'
import { getRoutes, getStations, searchStations, type Route, type Station } from '../api'
import { Card, SearchInput, StationLink, Status } from '../components'
import { nearestStations, walkLabel } from '../geo'
import { usePolling } from '../usePolling'

export default function HomePage() {
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(getStations, 'stations')
  const [query, setQuery] = useState('')
  const results = stations.data ? searchStations(stations.data, query) : []

  return (
    <>
      <SearchInput value={query} onChange={setQuery} placeholder="Search stations" />

      <Status error={stations.error} loading={!!query.trim() && !stations.data && !stations.error} />

      {query.trim() ? (
        <section>
          {stations.data && results.length === 0 && (
            <p className="px-1 text-neutral-500">No stations match “{query.trim()}”.</p>
          )}
          <StationList stations={results} routes={routes.data} />
        </section>
      ) : (
        stations.data && <Nearby stations={stations.data} routes={routes.data} />
      )}
    </>
  )
}

function StationList({ stations, routes, details }: { stations: Station[]; routes: Route[] | undefined; details?: string[] }) {
  return (
    <ul className="space-y-2">
      {stations.map((station, i) => (
        <li key={station.mbtaStopId}>
          <Card>
            <StationLink station={station} routes={routes} detail={details?.[i]} />
          </Card>
        </li>
      ))}
    </ul>
  )
}

type Located = { state: 'idle' | 'locating' } | { state: 'error'; message: string } | { state: 'found'; coords: GeolocationCoordinates }

function Nearby({ stations, routes }: { stations: Station[]; routes: Route[] | undefined }) {
  const [location, setLocation] = useState<Located>({ state: 'idle' })

  const locate = () => {
    setLocation({ state: 'locating' })
    navigator.geolocation.getCurrentPosition(
      (position) => setLocation({ state: 'found', coords: position.coords }),
      (error) =>
        setLocation({
          state: 'error',
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location access is off. Allow it in Settings to see stations near you.'
              : "Couldn't find your location. Try again in a moment.",
        }),
      { maximumAge: 60_000, timeout: 15_000 },
    )
  }

  // Skip the button if the user already allowed location.
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && locate())
      .catch(() => {})
  }, [])

  const nearest = location.state === 'found' ? nearestStations(stations, location.coords) : []

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-lg font-bold">Near you</h2>
      {location.state === 'found' ? (
        <StationList
          stations={nearest.map((n) => n.station)}
          routes={routes}
          details={nearest.map((n) => walkLabel(n.miles))}
        />
      ) : (
        <Card>
          <p className="text-neutral-500">
            {location.state === 'error' ? location.message : 'See the closest T stations and how far a walk they are.'}
          </p>
          <button
            onClick={locate}
            disabled={location.state === 'locating'}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-neutral-900 font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2" aria-hidden>
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              <circle cx="12" cy="12" r="6" />
            </svg>
            {location.state === 'locating' ? 'Finding you…' : 'Use my location'}
          </button>
        </Card>
      )}
    </section>
  )
}
