import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api, getRoutes, getStations, stationRouteIds, type RouteShape, type Vehicle } from '../api'
import { Status } from '../components'
import { boundsOf, locationErrorMessage, nearestStations, OUT_OF_AREA_MILES } from '../geo'
import { loadMapKit, stationElement, trainCallout, trainElement, updateTrainElement, userElement } from '../mapkit'
import { decodePolyline } from '../polyline'
import { trackSnapper } from '../snap'
import { usePolling, useTitle } from '../usePolling'

const REFRESH_MS = 10_000

// Filter chips. A line matches its route IDs by prefix: "Green" is all four branches.
const LINES = ['Red', 'Orange', 'Blue', 'Green', 'Mattapan']
const onLine = (line: string | null, routeId: string) => !line || routeId.startsWith(line)

const coordinate = ([lat, lon]: [number, number]) => new mapkit.Coordinate(lat, lon)
const regionAround = (points: [number, number][]) => {
  const b = boundsOf(points)
  return b && new mapkit.BoundingRegion(b.north, b.east, b.south, b.west).toCoordinateRegion()
}
// Downtown and the inner stops, where most trains are; the whole system would make downtown too crowded on a phone.
const bostonRegion = () => new mapkit.CoordinateRegion(new mapkit.Coordinate(42.355, -71.08), new mapkit.CoordinateSpan(0.1, 0.12))

// Dots are centered on their spot. MapKit puts an element's bottom-center there (like a pin), and a positive
// anchorOffset y moves it up, so shift down by half the height. The e2e tests check markers land on their coordinates.
const centered = (size: number) => ({ size: { width: size, height: size }, anchorOffset: new DOMPoint(0, -size / 2) })

export default function MapPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const line = LINES.find((l) => l === params.get('line')) ?? null // in the URL, so Back and shared links keep it
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(getStations, 'stations')
  const shapes = usePolling(() => api<RouteShape[]>('/routes/shapes'), 'shapes')
  const vehicles = usePolling(() => api<Vehicle[]>('/vehicles'), 'vehicles', REFRESH_MS)
  const tracks = useMemo(() => shapes.data?.map((s) => ({ routeId: s.routeId, points: decodePolyline(s.polyline) })), [shapes.data])
  // Puts each train on its own line, arrow along the track the way it's going (see snap.ts).
  const place = useMemo(
    () => tracks && stations.data && trackSnapper(tracks, stations.data),
    [tracks, stations.data],
  )

  const container = useRef<HTMLDivElement>(null)
  const trains = useRef(new Map<string, mapkit.Annotation>())
  const me = useRef<mapkit.Annotation>(undefined)
  const [map, setMap] = useState<mapkit.Map>()
  const [mapError, setMapError] = useState<Error>()
  const [locating, setLocating] = useState(false)
  const [locateMessage, setLocateMessage] = useState<string>()
  useTitle('Live map')

  // Light or dark map, following the phone's setting, including when it changes while the map is open.
  useEffect(() => {
    if (!map) return
    const dark = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      // oxlint-disable-next-line react/immutability -- Apple's map object, not React state; this is its API
      map.colorScheme = dark.matches ? mapkit.Map.ColorSchemes.Dark : mapkit.Map.ColorSchemes.Light
    }
    apply()
    dark.addEventListener('change', apply)
    return () => dark.removeEventListener('change', apply)
  }, [map])

  // Lines
  useEffect(() => {
    if (!map || !tracks) return
    const color = (id: string) => routes.data?.find((r) => r.id === id)?.color ?? 'gray'
    const overlays = tracks
      .filter((t) => onLine(line, t.routeId))
      .map((t) => new mapkit.PolylineOverlay(t.points.map(coordinate), {
        style: new mapkit.Style({ strokeColor: color(t.routeId), lineWidth: 5, strokeOpacity: 0.9, lineJoin: 'round', lineCap: 'round' }),
      }))
    map.addOverlays(overlays)
    return () => void map.removeOverlays(overlays)
  }, [map, tracks, routes.data, line])

  // Picking a line zooms to fit it; All goes back to downtown.
  useEffect(() => {
    if (!map || !tracks) return
    const region = line && regionAround(tracks.filter((t) => onLine(line, t.routeId)).flatMap((t) => t.points))
    map.setRegionAnimated(region || bostonRegion())
  }, [map, tracks, line])

  // Stations: tap to open departures
  useEffect(() => {
    if (!map || !stations.data) return
    const annotations = stations.data.filter((s) => stationRouteIds(s).some((id) => onLine(line, id))).map((s) => {
      const open = () => navigate(`/stations/${s.mbtaStopId}`)
      return new mapkit.Annotation(new mapkit.Coordinate(s.latitude, s.longitude), () => stationElement(s.name, open), {
        ...centered(12),
        title: s.name, // plain text: MapKit never parses it as HTML
        enabled: false, // the dot handles its own taps (see stationElement)
        displayPriority: mapkit.Annotation.DisplayPriority.Required, // never hidden to avoid overlaps
      })
    })
    map.addAnnotations(annotations)
    return () => void map.removeAnnotations(annotations)
  }, [map, stations.data, navigate, line])

  // Trains: move existing markers instead of recreating them, so an open callout survives a refresh.
  useEffect(() => {
    if (!map || !vehicles.data) return
    const live = new Set<string>()
    for (const v of vehicles.data.filter((v) => onLine(line, v.routeId))) {
      live.add(v.id)
      const route = routes.data?.find((r) => r.id === v.routeId)
      const color = route?.color ?? 'gray'
      const { title, subtitle } = trainCallout(v, route)
      // Until the tracks load, the raw GPS position and compass bearing.
      const destination = route?.directionDestinations[v.directionId] ?? null
      const { latitude, longitude, heading } = place?.({ ...v, destination }) ?? { ...v, heading: v.bearing }
      let annotation = trains.current.get(v.id)
      if (!annotation) {
        annotation = new mapkit.Annotation(coordinate([latitude, longitude]), () => trainElement(color, heading), {
          ...centered(24),
          displayPriority: mapkit.Annotation.DisplayPriority.Required,
        })
        map.addAnnotation(annotation)
        trains.current.set(v.id, annotation)
      } else {
        annotation.coordinate = coordinate([latitude, longitude])
        updateTrainElement(annotation.element, color, heading)
      }
      annotation.title = title // callout text; plain text, never HTML
      annotation.subtitle = subtitle
      annotation.accessibilityLabel = subtitle ? `${title}. ${subtitle}` : title
    }
    for (const [id, annotation] of trains.current) {
      if (!live.has(id)) {
        map.removeAnnotation(annotation)
        trains.current.delete(id)
      }
    }
  }, [map, vehicles.data, routes.data, line, place])

  // Keep trains above stations: MapKit draws annotations in the order they were added, and the station effect
  // above re-adds stations whenever they or the line change.
  useEffect(() => {
    if (!map || !stations.data) return
    const markers = [...trains.current.values()]
    map.removeAnnotations(markers)
    map.addAnnotations(markers)
  }, [map, stations.data, line])

  // Apple Maps: loads MapKit (once per visit) with a token from our API, then draws the map.
  // Declared after the effects that add lines and markers: React runs cleanups in declaration order, so leaving the
  // page removes those first and destroys the map last (MapKit throws if you remove things from a destroyed map).
  useEffect(() => {
    let cancelled = false
    let created: mapkit.Map | undefined
    loadMapKit().then(
      () => {
        if (cancelled) return
        created = new mapkit.Map(container.current!, {
          region: bostonRegion(),
          isRotationEnabled: false, // north stays up, like the line diagrams
          showsCompass: mapkit.FeatureVisibility.Hidden,
          showsScale: mapkit.FeatureVisibility.Hidden,
          showsMapTypeControl: false,
          showsUserLocationControl: false, // our own button, which knows when you're outside the T's area
          pointOfInterestFilter: mapkit.PointOfInterestFilter.excludingAllCategories, // stations, not coffee shops
        })
        setMap(created)
      },
      () => !cancelled && setMapError(new Error("The map isn't available right now.")), // Status shows a friendly message and Try again
    )
    const markers = trains.current
    return () => {
      cancelled = true
      created?.destroy()
      markers.clear()
      me.current = undefined
    }
  }, [])

  // Center on the user with a blue dot, unless they're nowhere near the T.
  const locate = () => {
    if (!map) return
    setLocating(true)
    setLocateMessage(undefined)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false)
        const nearest = stations.data && nearestStations(stations.data, coords, 1)[0]
        if (nearest && nearest.miles > OUT_OF_AREA_MILES) {
          setLocateMessage("You're outside the MBTA subway area.")
          return
        }
        const here = new mapkit.Coordinate(coords.latitude, coords.longitude)
        if (!me.current) {
          me.current = new mapkit.Annotation(here, userElement, {
            ...centered(20),
            accessibilityLabel: 'Your location',
            calloutEnabled: false,
            enabled: false, // not tappable
            displayPriority: mapkit.Annotation.DisplayPriority.Required,
          })
          map.addAnnotation(me.current)
        }
        me.current.coordinate = here
        map.setRegionAnimated(new mapkit.CoordinateRegion(here, new mapkit.CoordinateSpan(0.012, 0.012)))
      },
      (error) => {
        setLocating(false)
        setLocateMessage(locationErrorMessage(error))
      },
      { maximumAge: 30_000, timeout: 15_000 },
    )
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Live map</h1>
      <Status error={mapError ?? vehicles.error ?? shapes.error ?? stations.error} />
      <div role="radiogroup" aria-label="Show line" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {[null, ...LINES].map((l) => {
          const color = l ? routes.data?.find((r) => r.id.startsWith(l))?.color : undefined
          const selected = line === l
          return (
            <button
              key={l ?? 'all'}
              role="radio"
              aria-checked={selected}
              onClick={() => setParams(l ? { line: l } : {}, { replace: true })}
              className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow-sm ${selected ? 'text-white' : 'bg-white dark:bg-neutral-900'} ${selected && !l ? 'bg-neutral-900 dark:bg-white dark:text-neutral-900' : ''}`}
              style={selected && color ? { backgroundColor: color } : undefined}
            >
              {l && !selected && <span className="size-2.5 rounded-full" style={{ backgroundColor: color ?? 'gray' }} />}
              {l ?? 'All'}
            </button>
          )
        })}
      </div>
      {/* isolate keeps the map's own z-indexes below the sticky header */}
      <div className="relative isolate">
        <div
          ref={container}
          data-testid="map"
          className="h-[calc(100dvh-19rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 overflow-hidden rounded-xl bg-neutral-200 shadow-sm dark:bg-neutral-800"
        />
        <button
          onClick={locate}
          disabled={locating || !map}
          aria-label="Show my location"
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-white text-blue-600 shadow-md active:opacity-70 disabled:opacity-60 dark:bg-neutral-800 dark:text-blue-400"
        >
          <svg viewBox="0 0 24 24" className={`size-6 fill-current ${locating ? 'motion-safe:animate-pulse' : ''}`} aria-hidden>
            <path d="M21 3 3 10.5l7.5 2.9L13.5 21z" />
          </svg>
        </button>
      </div>
      {locateMessage && (
        <p role="status" className="text-center text-sm text-neutral-500">
          {locateMessage}
        </p>
      )}
      <p className="text-center text-xs text-neutral-500">
        Trains update every 10 seconds; arrows show the direction of travel. Tap a train for where it's headed, or a station for departures.
      </p>
    </>
  )
}
