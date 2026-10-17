import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { findRoute, getBusStops, getRoutes, getStations, getTrips, ROUTES, type Route, type Station, type TripOption } from '../api'
import { Card, LineBadge, linkButton, SearchInput, secondaryButton, Status, StopName } from '../components'
import { currentPosition, locationErrorMessage, locationRemembered, tripStops, tripStopsParam } from '../geo'
import { placeOf, preparePlaces, suggestPlaces, type Place, type Suggestion } from '../places'
import { clock } from '../time'
import { adviceText } from '../transfers'
import { failure, useNow, usePolling, useTitle } from '../usePolling'

const REFRESH_MS = 30_000
const MY_LOCATION = 'My location'

// /trip, or /trip?to=Harvard Square from Home's "Where to?": the best trains and buses from here (or a typed place)
// to there, with at most one change. The stops near each end are worked out here; the server only gets their IDs and
// the walk to each (getTrips), never where you are.
export default function TripPage() {
  const [params] = useSearchParams()
  const routes = usePolling(getRoutes, ROUTES)
  const stations = usePolling(getStations, 'stations')
  const busStops = usePolling(getBusStops, '/bus-stops', undefined, { remember: false }) // ~1 MB: the browser caches it
  const [from, setFrom] = useState<Place>()
  // A place picked in Home's search comes with where it is (?to=…&lat=…&lon=…); typed text is looked up.
  const [to, setTo] = useState<Place | undefined>(() => {
    const [name, latitude, longitude] = [params.get('to'), Number(params.get('lat')), Number(params.get('lon'))]
    return name && latitude && longitude ? { name, latitude, longitude } : undefined
  })
  // From where you are, without a tap, once location has worked here (or the browser says it's allowed), as on Home.
  const [locating, setLocating] = useState(locationRemembered)
  const [locationError, setLocationError] = useState<string>()
  useTitle('Plan a trip')

  const find = () =>
    currentPosition()
      .then(
        ({ latitude, longitude }) => setFrom({ name: MY_LOCATION, latitude, longitude }),
        (error: GeolocationPositionError) => setLocationError(locationErrorMessage(error)),
      )
      .finally(() => setLocating(false))
  const locate = () => {
    setLocating(true)
    setLocationError(undefined)
    void find()
  }
  useEffect(() => {
    if (locationRemembered()) return void find()
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then((p) => p.state === 'granted' && locate())
      .catch(() => {})
  }, [])

  const near = (place: Place | undefined) => (place && stations.data && busStops.data ? tripStops(stations.data, busStops.data, place) : undefined)
  const fromStops = near(from)
  const toStops = near(to)
  const path = fromStops?.length && toStops?.length ? `/trips?from=${tripStopsParam(fromStops)}&to=${tripStopsParam(toStops)}` : ''
  const trips = usePolling(() => (path ? getTrips(path) : Promise.resolve(undefined)), path || 'no-trip', REFRESH_MS, {
    remember: false, // old times and advice mislead
  })
  const noStops = (fromStops?.length === 0 && from) || (toStops?.length === 0 && to)

  return (
    <>
      <h1 className="text-2xl font-bold">Plan a trip</h1>
      <PlaceField label="From" place={from} onPlace={setFrom} stations={stations.data} busStops={busStops.data}>
        <button onClick={locate} disabled={locating} className={secondaryButton}>
          <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current stroke-2" aria-hidden>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="6" />
          </svg>
          {locating ? 'Finding you…' : 'Use my location'}
        </button>
        {locationError && <p className="px-1 text-sm text-neutral-500">{locationError}</p>}
      </PlaceField>
      <PlaceField
        label="To"
        place={to}
        onPlace={setTo}
        stations={stations.data}
        busStops={busStops.data}
        initialQuery={params.get('lat') ? '' : (params.get('to') ?? '')}
      />

      <Status error={failure(stations) ?? failure(trips)} loading={!!path && !trips.data && !trips.error} rows={2} />

      <section aria-label="Trips" className="space-y-2">
        <p role="status" className="px-1 text-neutral-500">
          {noStops
            ? `No T stations or bus stops within a 12-minute walk of ${noStops.name}.`
            : trips.data?.length === 0
              ? 'No train or bus with at most one change has live times for this trip right now. Try again in a minute.'
              : ''}
        </p>
        <ul className="space-y-3">
          {trips.data?.map((trip) => (
            <li key={trip.legs.map((l) => `${l.routeId}|${l.from.id}`).join('>')}>
              <TripCard trip={trip} routes={routes.data} from={from} stops={fromStops?.map((n) => n.station) ?? []} />
            </li>
          ))}
        </ul>
        {!!trips.data?.length && <p className="text-center text-xs text-neutral-500">Live from MBTA, updated every 30 seconds</p>}
      </section>
    </>
  )
}

// An end of the trip: once chosen, its name and a way to change it; before that, a search with suggestions. With
// `initialQuery` (Home's "Where to?"), the best match is taken straight away.
function PlaceField({ label, place, onPlace, stations, busStops, initialQuery = '', children }: {
  label: string
  place: Place | undefined
  onPlace: (place: Place | undefined) => void
  stations: Station[] | undefined
  busStops: Station[] | undefined
  initialQuery?: string
  children?: ReactNode
}) {
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState<string>()
  const autoPick = useRef(!!initialQuery)

  const pick = async (suggestion: Suggestion) => {
    setError(undefined)
    const found = await placeOf(suggestion).catch(() => undefined)
    if (found) onPlace(found)
    else setError(`Couldn't find where ${suggestion.name} is. Try another address or place.`)
  }

  // A moment after typing stops, so Apple isn't asked on every keystroke.
  useEffect(() => {
    if (!query.trim() || !stations) return
    let cancelled = false
    const timer = setTimeout(
      () =>
        void suggestPlaces(query, [...stations, ...(busStops ?? [])]).then((found) => {
          if (cancelled) return
          setSuggestions(found)
          if (autoPick.current && found[0]) void pick(found[0])
          autoPick.current = false
        }),
      250,
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // pick is recreated every render; what's typed and the stop lists are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, stations, busStops])

  if (place) {
    return (
      <Card>
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0">
            <span className="block text-sm text-neutral-500">{label}</span>
            <span className="font-semibold">{place.name}</span>
          </span>
          <button onClick={() => onPlace(undefined)} className={linkButton}>
            Change<span className="sr-only"> {label === 'From' ? 'where you start' : "where you're going"}</span>
          </button>
        </div>
      </Card>
    )
  }

  const shown = query.trim() ? suggestions : []
  return (
    <div className="space-y-2" onFocus={preparePlaces}>
      <SearchInput value={query} onChange={setQuery} placeholder={`${label}: address, place, or stop`} onSubmit={() => shown[0] && void pick(shown[0])} />
      {children}
      {error && <p className="px-1 text-sm text-red-700 dark:text-red-300">{error}</p>}
      <p role="status" className="sr-only">
        {shown.length > 0 ? `${shown.length} suggestions` : ''}
      </p>
      {shown.length > 0 && (
        <ul className="space-y-1">
          {shown.map((s, i) => (
            <li key={`${i}|${s.name}`}>
              <button onClick={() => void pick(s)} className="w-full text-left">
                <Card>
                  <span className="block font-medium">{s.name}</span>
                  {s.detail && <span className="block text-sm text-neutral-500">{s.detail}</span>}
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// One way there: whether to hurry, when you arrive, and each step with its times.
function TripCard({ trip, routes, from, stops }: { trip: TripOption; routes: Route[] | undefined; from: Place | undefined; stops: Station[] }) {
  const now = useNow(15_000)
  const [first, second] = trip.legs
  const last = trip.legs[trip.legs.length - 1]
  const hurry = trip.startAdvice === 'Hurry'
  const leave = Date.parse(first.departure) - trip.walkToFirst * 60_000
  const advice = second && trip.transferAdvice ? adviceText(trip.transferAdvice, findRoute(routes, second.routeId), first.to.name, now) : undefined
  const toward = (leg: (typeof trip.legs)[number]) => findRoute(routes, leg.routeId)?.directionDestinations[leg.directionId]
  // Apple Maps walking directions to the first stop, from the place typed (or from wherever you are).
  const stop = stops.find((s) => s.mbtaStopId === first.from.id)
  const start = from && from.name !== MY_LOCATION ? `saddr=${from.latitude},${from.longitude}&` : ''

  return (
    <Card>
      <p className={`text-lg font-bold ${hurry ? 'text-amber-700 dark:text-amber-400' : 'text-green-700 dark:text-green-400'}`}>
        {hurry ? 'Hurry, leave now' : `Relax, leave in ${trip.leaveIn} min`}
      </p>
      <p className="font-semibold">
        Arrive {clock(trip.arrival)} · {Math.round((Date.parse(trip.arrival) - leave) / 60_000)} min
      </p>
      <ol className="mt-3 space-y-3">
        <Step badge={<LineBadge routeId={first.routeId} routes={routes} />}>
          Board at <StopName station={first.from} className="font-bold" />, {clock(first.departure)}
          <span className="block text-sm text-neutral-500">
            {[toward(first) && `to ${toward(first)}`, `${trip.walkToFirst} min walk`].filter(Boolean).join(' · ')}
          </span>
        </Step>
        {second && (
          <Step badge={<LineBadge routeId={second.routeId} routes={routes} />}>
            Change at <StopName station={first.to} className="font-bold" />
            {second.from.id !== first.to.id && (
              <>
                , walk to <StopName station={second.from} className="font-bold" />
              </>
            )}
            , {clock(second.departure)}
            {toward(second) && <span className="block text-sm text-neutral-500">to {toward(second)}</span>}
            {advice && (
              <span
                className={`mt-1 block text-sm ${advice.tone === 'hurry' ? 'font-semibold text-amber-700 dark:text-amber-400' : advice.tone === 'calm' ? 'font-semibold text-green-700 dark:text-green-400' : 'text-neutral-600 dark:text-neutral-300'}`}
              >
                {advice.text}
              </span>
            )}
          </Step>
        )}
        <Step>
          Get off at <StopName station={last.to} className="font-bold" />, {clock(last.arrival)}
          <span className="block text-sm text-neutral-500">Then a {trip.walkFromLast} min walk</span>
        </Step>
      </ol>
      <div className="-mx-2 mt-2 flex justify-between border-t border-neutral-100 pt-1 dark:border-neutral-800">
        {stop && (
          <a href={`https://maps.apple.com/?${start}daddr=${stop.latitude},${stop.longitude}&dirflg=w`} target="_blank" rel="noreferrer" className={linkButton}>
            Walk there<span className="sr-only"> to {first.from.name} (opens Apple Maps)</span>
          </a>
        )}
        <Link to={`/commutes/new?station=${encodeURIComponent(first.from.id)}&route=${encodeURIComponent(first.routeId)}`} className={`ml-auto ${linkButton}`}>
          Save as commute
        </Link>
      </div>
    </Card>
  )
}

function Step({ badge, children }: { badge?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="flex w-10 shrink-0 justify-center">{badge}</span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}
