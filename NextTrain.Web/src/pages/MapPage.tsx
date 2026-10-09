import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import {
  api, findRoute, getRoutes, getStations, ROUTES, searchRoutes, stationRouteIds,
  type Car, type Prediction, type Route, type RouteShape, type Station, type Vehicle,
} from '../api'
import { LineBadge, SearchInput, Status } from '../components'
import { boundsOf, locationErrorMessage, nearestStations, OUT_OF_AREA_MILES } from '../geo'
import { loadMapKit, stationElement, trainCallout, trainElement, updateTrainElement, userElement, type Preview } from '../mapkit'
import { decodePolyline } from '../polyline'
import { trackSnapper } from '../snap'
import { countdown, groupDepartures, noTrainsMessage } from '../time'
import { useNow, usePolling, useTitle } from '../usePolling'

const REFRESH_MS = 10_000

// Filter chips. Red and Green offer a second row to narrow to one branch; Mattapan sits under Red, as MBTA runs it.
interface Line {
  id: string
  routes: string[]
  branches?: [routeId: string, label: string][]
}
const LINES: Line[] = [
  { id: 'Red', routes: ['Red', 'Mattapan'], branches: [['Red', 'Red Line'], ['Mattapan', 'Mattapan']] },
  { id: 'Orange', routes: ['Orange'] },
  { id: 'Blue', routes: ['Blue'] },
  { id: 'Green', routes: ['Green-B', 'Green-C', 'Green-D', 'Green-E'], branches: [['Green-B', 'B'], ['Green-C', 'C'], ['Green-D', 'D'], ['Green-E', 'E']] },
]
// The route IDs a selection shows: a line's routes, or one branch; undefined for All. Fixed arrays, so effects that
// depend on them only rerun when the selection changes.
const BRANCH_ROUTES = new Map(LINES.flatMap((l) => (l.branches ?? []).map(([id]): [string, string[]] => [id, [id]])))
const routesFor = (line: Line | undefined, branch: string | undefined) => (branch ? BRANCH_ROUTES.get(branch) : line?.routes)
const onLine = (shown: string[] | undefined, routeId: string) => !shown || shown.includes(routeId)

const coordinate = ([lat, lon]: [number, number]) => new mapkit.Coordinate(lat, lon)
const regionAround = (points: [number, number][]) => {
  const b = boundsOf(points)
  return b && new mapkit.BoundingRegion(b.north, b.east, b.south, b.west).toCoordinateRegion()
}
// Downtown and the inner stops, where most trains are; the whole system would make downtown too crowded on a phone.
const bostonRegion = () => new mapkit.CoordinateRegion(new mapkit.Coordinate(42.355, -71.08), new mapkit.CoordinateSpan(0.1, 0.12))

// Zoomed in closer than this (degrees of latitude across the map, about 2 km), station names show beside the dots.
const SHOW_NAMES_BELOW = 0.02

// Glide to a new view, or jump there for people who've asked their device for less motion.
const animate = () => !matchMedia('(prefers-reduced-motion: reduce)').matches

// Dots are centered on their spot. MapKit puts an element's bottom-center there (like a pin), and a positive
// anchorOffset y moves it up, so shift down by half the height. The e2e tests check markers land on their coordinates.
const centered = (size: number) => ({ size: { width: size, height: size }, anchorOffset: new DOMPoint(0, -size / 2) })

export default function MapPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // In the URL (?line=Green&branch=Green-B), so Back and shared links keep it.
  const line = LINES.find((l) => l.id === params.get('line'))
  const branch = line?.branches?.find(([id]) => id === params.get('branch'))?.[0]
  // Bus mode (?line=bus&route=741): one bus route at a time, its streets, stops, and buses. There are ~150 routes and
  // hundreds of buses; all at once would bury the map.
  const busMode = params.get('line') === 'bus'
  const busRoute = (busMode && params.get('route')) || undefined
  const shown = useMemo(() => (busMode ? (busRoute ? [busRoute] : []) : routesFor(line, branch)), [busMode, busRoute, line, branch])
  const routes = usePolling(getRoutes, ROUTES)
  const bus = busMode ? `?route=${encodeURIComponent(busRoute ?? '')}` : '' // a query string, or nothing for the subway
  const stationsPath = busMode ? `/stations${bus}` : 'stations'
  const stations = usePolling(busMode ? () => (busRoute ? api<Station[]>(stationsPath) : Promise.resolve([])) : getStations, stationsPath)
  const shapesPath = busMode ? `/routes/${encodeURIComponent(busRoute ?? '')}/shapes` : '/routes/shapes'
  const shapes = usePolling(() => (busMode && !busRoute ? Promise.resolve([]) : api<RouteShape[]>(shapesPath)), busMode ? shapesPath : 'shapes')
  const vehiclesPath = `/vehicles${bus}`
  const vehicles = usePolling(
    () => (busMode && !busRoute ? Promise.resolve([]) : api<Vehicle[]>(vehiclesPath)),
    busMode ? vehiclesPath : 'vehicles',
    REFRESH_MS,
    { remember: false }, // old positions mislead
  )
  const busRouteInfo = busRoute ? findRoute(routes.data, busRoute) : undefined
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

  // The station or train whose card is showing (hover, keyboard focus, or a tap on a train), and where to draw it.
  const frame = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<CardAt & ({ station: Station } | { trainId: string })>()
  const previewTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const overCard = useRef(false) // checked when a delayed hide fires: the dot's leave and the card's enter race
  const previews = useMemo(() => {
    // A short delay each way: sweeping the mouse across the map doesn't flash cards, and there's time to move the
    // pointer onto the card (WCAG 1.4.13: hover content must be hoverable and dismissible).
    const later = (fn: () => void, ms: number) => {
      clearTimeout(previewTimer.current)
      previewTimer.current = setTimeout(fn, ms)
    }
    const hide = (now?: boolean) => {
      if (!now) return later(() => !overCard.current && setPreview(undefined), 200)
      clearTimeout(previewTimer.current)
      overCard.current = false
      setPreview(undefined)
    }
    const showFor = (what: { station: Station } | { trainId: string }): Preview => ({
      show: (marker) =>
        later(() => {
          const at = cardAt(marker, frame.current)
          if (at) setPreview({ ...at, ...what })
        }, 120),
      hide,
    })
    const forStation = (station: Station) => showFor({ station })
    const forTrain = (trainId: string) => showFor({ trainId })
    const enterCard = () => {
      overCard.current = true
      clearTimeout(previewTimer.current)
    }
    const leaveCard = () => {
      overCard.current = false
      hide()
    }
    return { forStation, forTrain, hide, enterCard, leaveCard }
  }, [])
  useEffect(() => () => clearTimeout(previewTimer.current), [])

  // Station names appear beside the dots once zoomed in far enough that they have room (about a neighborhood across).
  const [showNames, setShowNames] = useState(false)
  useEffect(() => {
    if (!map) return
    const update = () => setShowNames(map.region.span.latitudeDelta < SHOW_NAMES_BELOW)
    update()
    map.addEventListener('region-change-end', update)
    return () => map.removeEventListener('region-change-end', update)
  }, [map])

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

  // Lines (and bus routes). Bus yellow is too pale on a light map by itself, so a darker line runs underneath it.
  useEffect(() => {
    if (!map || !tracks) return
    const line = (t: { routeId: string; points: [number, number][] }, color: string, lineWidth: number) =>
      new mapkit.PolylineOverlay(t.points.map(coordinate), {
        style: new mapkit.Style({ strokeColor: color, lineWidth, strokeOpacity: 0.9, lineJoin: 'round', lineCap: 'round' }),
      })
    const visible = tracks.filter((t) => onLine(shown, t.routeId))
    const pale = (id: string) => findRoute(routes.data, id)?.textColor === '#000000'
    const overlays = [
      ...visible.filter((t) => pale(t.routeId)).map((t) => line(t, '#6b4f00', 8)),
      ...visible.map((t) => line(t, findRoute(routes.data, t.routeId)?.color ?? 'gray', 5)),
    ]
    map.addOverlays(overlays)
    return () => void map.removeOverlays(overlays)
  }, [map, tracks, routes.data, shown])

  // Picking a line or branch zooms to fit it; All goes back to downtown.
  useEffect(() => {
    if (!map || !tracks) return
    const region = shown && regionAround(tracks.filter((t) => onLine(shown, t.routeId)).flatMap((t) => t.points))
    map.setRegionAnimated(region || bostonRegion(), animate())
  }, [map, tracks, shown])

  // Stations: tap to open departures
  useEffect(() => {
    if (!map || !stations.data) return
    // In bus mode the list is already the route's stops (bus stops have no subway lines to filter on).
    const annotations = stations.data.filter((s) => busMode || stationRouteIds(s).some((id) => onLine(shown, id))).map((s) => {
      const open = () => navigate(`/stations/${s.mbtaStopId}`)
      const kind = s.routeId ? 'station' : 'stop'
      return new mapkit.Annotation(new mapkit.Coordinate(s.latitude, s.longitude), () => stationElement(s.name, open, previews.forStation(s), kind), {
        ...centered(24), // the dot's tap area; it looks 12 px
        title: s.name, // plain text: MapKit never parses it as HTML
        enabled: false, // the dot handles its own taps (see stationElement)
        displayPriority: mapkit.Annotation.DisplayPriority.Required, // never hidden to avoid overlaps
      })
    })
    map.addAnnotations(annotations)
    return () => {
      map.removeAnnotations(annotations)
      previews.hide(true) // its dot is gone
    }
  }, [map, stations.data, navigate, shown, previews, busMode])

  // Panning or zooming moves the markers out from under the card, so close it; Escape, or a tap on the map away from
  // a marker (how a phone closes a train's card), closes it too.
  const cardOpen = !!preview
  const trainCard = preview && 'trainId' in preview ? vehicles.data?.find((v) => v.id === preview.trainId) : undefined
  useEffect(() => {
    if (!map || !cardOpen) return
    const close = () => previews.hide(true)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    const onTap = (event: PointerEvent) => !(event.target as Element).closest?.('.station-dot, .train') && close()
    map.addEventListener('region-change-start', close)
    document.addEventListener('keydown', onKey)
    container.current?.addEventListener('pointerdown', onTap)
    const element = container.current
    return () => {
      map.removeEventListener('region-change-start', close)
      document.removeEventListener('keydown', onKey)
      element?.removeEventListener('pointerdown', onTap)
    }
  }, [map, cardOpen, previews])

  // Trains: move existing markers instead of recreating them, so an open card follows its train through a refresh.
  useEffect(() => {
    if (!map || !vehicles.data) return
    const live = new Set<string>()
    for (const v of vehicles.data.filter((v) => onLine(shown, v.routeId))) {
      live.add(v.id)
      const route = findRoute(routes.data, v.routeId)
      const color = route?.color ?? 'gray'
      const ink = route?.textColor ?? 'white' // the arrow: white on the subway's colors, black on bus yellow
      const { title, subtitle } = trainCallout(v, route)
      const label = subtitle ? `${title}. ${subtitle}` : title
      // Until the tracks load, the raw GPS position and compass bearing.
      const destination = route?.directionDestinations[v.directionId] ?? null
      const { latitude, longitude, heading } = place?.({ ...v, destination }) ?? { ...v, heading: v.bearing }
      let annotation = trains.current.get(v.id)
      if (!annotation) {
        annotation = new mapkit.Annotation(coordinate([latitude, longitude]), () => trainElement(color, heading, label, previews.forTrain(v.id), ink), {
          ...centered(24),
          enabled: false, // the train handles its own hover and taps (our card, not MapKit's callout)
          displayPriority: mapkit.Annotation.DisplayPriority.Required,
        })
        map.addAnnotation(annotation)
        trains.current.set(v.id, annotation)
      } else {
        annotation.coordinate = coordinate([latitude, longitude])
        updateTrainElement(annotation.element, color, heading, label, ink)
      }
    }
    for (const [id, annotation] of trains.current) {
      if (!live.has(id)) {
        map.removeAnnotation(annotation)
        trains.current.delete(id)
      }
    }
    // An open train card moves with its train (or closes if it left the map).
    setPreview((p) => {
      if (!p || !('trainId' in p)) return p
      const element = trains.current.get(p.trainId)?.element
      const at = element && cardAt(element, frame.current)
      return at ? { ...p, ...at } : undefined
    })
  }, [map, vehicles.data, routes.data, shown, place, previews])

  // Keep trains above stations: MapKit draws annotations in the order they were added, and the station effect
  // above re-adds stations whenever they or the line change.
  useEffect(() => {
    if (!map || !stations.data) return
    const markers = [...trains.current.values()]
    map.removeAnnotations(markers)
    map.addAnnotations(markers)
  }, [map, stations.data, shown])

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

  // Scroll to zoom, like other web maps. MapKit zooms only on Ctrl + wheel (a trackpad pinch sends that too) and leaves
  // a plain wheel to the page whenever the page could scroll. So hand MapKit each plain wheel as Ctrl + wheel, and
  // glide: a mouse notch arrives as one big jump, so it's fed to MapKit a fraction per frame (eases out over ~150 ms).
  // On iPhone, stop Safari from pinch-zooming the whole page over the map (MapKit still gets the pinch).
  useEffect(() => {
    const element = container.current
    if (!map || !element) return
    let pending = 0 // wheel distance not yet sent, in pixels
    let last: WheelEvent | undefined
    let frame = 0
    const step = () => {
      const delta = Math.abs(pending) < 2 ? pending : pending * 0.35
      pending -= delta
      last!.target?.dispatchEvent(new WheelEvent('wheel', { ...pick(last!), deltaY: delta, deltaMode: 0, ctrlKey: true, bubbles: true, cancelable: true }))
      frame = pending ? requestAnimationFrame(step) : 0
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.isTrusted) return // already a zoom (pinch), or our own re-sent event
      event.preventDefault()
      event.stopPropagation()
      pending += WHEEL_SPEED * event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1) // lines, pages -> px
      last = event
      frame ||= requestAnimationFrame(step)
    }
    const noPageZoom = (event: Event) => event.preventDefault() // Safari's gesturestart/gesturechange
    element.addEventListener('wheel', onWheel, { capture: true, passive: false })
    element.addEventListener('gesturestart', noPageZoom)
    element.addEventListener('gesturechange', noPageZoom)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('wheel', onWheel, { capture: true })
      element.removeEventListener('gesturestart', noPageZoom)
      element.removeEventListener('gesturechange', noPageZoom)
    }
  }, [map])

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
        map.setRegionAnimated(new mapkit.CoordinateRegion(here, new mapkit.CoordinateSpan(0.012, 0.012)), animate())
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
        {[undefined, ...LINES].map((l) => (
          <Chip
            key={l?.id ?? 'all'}
            label={l?.id ?? 'All'}
            name={l ? `${l.id} Line` : 'All lines'}
            color={l && routes.data?.find((r) => r.id.startsWith(l.id))?.color}
            selected={!busMode && line === l}
            onSelect={() => setParams(l ? { line: l.id } : {}, { replace: true })}
          />
        ))}
        <Chip label="Bus" name="Buses" color={BUS_YELLOW} ink="#000000" selected={busMode} onSelect={() => setParams({ line: 'bus' }, { replace: true })} />
      </div>
      {busMode && (
        <BusPicker
          routes={routes.data}
          selected={busRoute}
          onSelect={(id) => setParams({ line: 'bus', route: id }, { replace: true })}
        />
      )}
      {line?.branches && (
        <div role="radiogroup" aria-label={`Show ${line.id} Line branch`} className="-mx-4 -mt-2 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {[undefined, ...line.branches].map((b) => (
            <Chip
              key={b?.[0] ?? 'all'}
              small
              label={b?.[1] ?? 'All'}
              name={b ? (routes.data?.find((r) => r.id === b[0])?.name ?? b[1]) : `All ${line.id} Line`}
              color={b && routes.data?.find((r) => r.id === b[0])?.color}
              selected={branch === b?.[0]}
              onSelect={() => setParams(b ? { line: line.id, branch: b[0] } : { line: line.id }, { replace: true })}
            />
          ))}
        </div>
      )}
      {/* isolate keeps the map's own z-indexes below the sticky header; touch-none gives every touch gesture (pan,
          pinch) to the map, never the page */}
      <div ref={frame} className="relative isolate">
        <div
          ref={container}
          data-testid="map"
          className={`${showNames ? 'show-names ' : ''}touch-none h-[calc(100dvh-19rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 overflow-hidden rounded-xl bg-neutral-200 shadow-sm dark:bg-neutral-800`}
        />
        {!map && !mapError && (
          <p role="status" className="absolute inset-0 grid place-items-center text-sm font-semibold text-neutral-500 motion-safe:animate-pulse">
            Loading map…
          </p>
        )}
        {preview && 'station' in preview && (
          <StationPreview key={preview.station.mbtaStopId} {...preview} routes={routes.data} bus={busMode} onPointerEnter={previews.enterCard} onPointerLeave={previews.leaveCard} />
        )}
        {preview && 'trainId' in preview && trainCard && (
          <TrainPreview vehicle={trainCard} at={preview} routes={routes.data} onPointerEnter={previews.enterCard} onPointerLeave={previews.leaveCard} />
        )}
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
      {busMode && !busRoute && (
        <p className="text-center text-sm font-semibold text-neutral-500">Pick a bus route to see its streets, stops, and buses.</p>
      )}
      {vehicles.data && (!busMode || busRoute) && !vehicles.data.some((v) => onLine(shown, v.routeId)) && (
        <p role="status" className="text-center text-sm font-semibold text-neutral-500">
          {busMode
            ? `No ${busRouteInfo ? `Route ${busRouteInfo.shortName || busRouteInfo.id} ` : ''}buses are running right now.`
            : noTrainsRunning(branch ? routes.data?.find((r) => r.id === branch)?.name : line && `${line.id} Line`)}
        </p>
      )}
      {locateMessage && (
        <p role="status" className="text-center text-sm text-neutral-500">
          {locateMessage}
        </p>
      )}
      <p className="text-center text-xs text-neutral-500">
        {busMode
          ? "Buses update every 10 seconds; arrows show the direction of travel. Tap a bus for where it's headed, or a stop for departures."
          : "Trains update every 10 seconds; arrows show the direction of travel. Tap a train for where it's headed, or a station for departures."}
      </p>
    </>
  )
}

// "No Red Line trains are running right now." (or the overnight closure), for an empty map.
function noTrainsRunning(name: string | undefined) {
  const hour = new Date().getHours()
  if (hour >= 1 && hour < 5) return 'The subway is closed overnight. Trains start again around 5 AM.'
  return `No ${name ? `${name} ` : ''}trains are running right now.`
}

const BUS_YELLOW = '#FFC72C'

/**
 * A filter chip. `label` is what it shows ("B"); `name` is what screen readers hear ("Green Line B"). `ink` is the text
 * color when selected: white on the subway's colors, black on bus yellow.
 */
function Chip({ label, name, color, ink = '#FFFFFF', selected, small, onSelect }: {
  label: string
  name: string
  color: string | undefined
  ink?: string
  selected: boolean
  small?: boolean
  onSelect: () => void
}) {
  return (
    <button
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onClick={onSelect}
      className={`flex shrink-0 items-center gap-1.5 rounded-full font-semibold shadow-sm ${small ? 'min-h-8 px-3 text-xs' : 'min-h-9 px-3.5 text-sm'} ${selected ? 'text-white' : 'bg-white dark:bg-neutral-900'} ${selected && !color ? 'bg-neutral-900 dark:bg-white dark:text-neutral-900' : ''}`}
      style={selected && color ? { backgroundColor: color, color: ink } : undefined}
    >
      {color && !selected && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  )
}

// Bus mode's route picker: type a number ("66", "sl1") or a place, then pick from the matching routes. Before typing,
// the chosen route and the first routes in MBTA's order (Silver Line first).
function BusPicker({ routes, selected, onSelect }: { routes: Route[] | undefined; selected: string | undefined; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const buses = routes?.filter((r) => r.type === 'bus') ?? []
  const matches = query.trim() ? searchRoutes(buses, query, 12) : buses.slice(0, 12)
  const chosen = selected ? findRoute(routes, selected) : undefined
  const shown = chosen && !matches.includes(chosen) ? [chosen, ...matches] : matches
  return (
    <div className="space-y-2">
      <SearchInput value={query} onChange={setQuery} placeholder="Bus route number, e.g. 66 or SL1" onSubmit={() => matches[0] && onSelect(matches[0].id)} />
      <div role="radiogroup" aria-label="Show bus route" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {shown.map((r) => (
          <Chip
            key={r.id}
            small
            label={r.shortName || r.id}
            name={`Route ${r.shortName || r.id}, ${r.name}`}
            color={r.color}
            ink={r.textColor}
            selected={selected === r.id}
            onSelect={() => onSelect(r.id)}
          />
        ))}
        {query.trim() && matches.length === 0 && <p className="py-1 text-sm text-neutral-500">No bus route matches “{query.trim()}”.</p>}
      </div>
    </div>
  )
}

const CARD_WIDTH = 288 // px; w-72

// Where a marker is, relative to the map's frame, for placing its card.
type CardAt = { x: number; y: number; width: number }
function cardAt(marker: Element, frame: HTMLElement | null): CardAt | undefined {
  const box = frame?.getBoundingClientRect()
  const r = marker.getBoundingClientRect()
  return box && { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, width: box.width }
}

/** A card over the map beside a marker: centered on it, nudged in from the sides, above it unless that runs off the top. */
function MarkerCard({ id, x, y, width, onPointerEnter, onPointerLeave, children }: CardAt & {
  id: string
  onPointerEnter: () => void
  onPointerLeave: () => void
  children: ReactNode
}) {
  const left = Math.min(Math.max(x, CARD_WIDTH / 2 + 8), Math.max(width - CARD_WIDTH / 2 - 8, CARD_WIDTH / 2 + 8))
  const below = y < 180
  return (
    <div
      id={id}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className="absolute z-20 w-72 space-y-2 rounded-xl bg-white p-3 text-sm shadow-lg ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
      style={{ left, top: below ? y + 14 : y - 14, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}
    >
      {children}
    </div>
  )
}

/**
 * A station's next trains, over the map beside its dot: on mouse hover or keyboard focus. Each direction's next two
 * departures, refreshed every 10 seconds while it's open. Select the station for all of them.
 */
function StationPreview({ station, x, y, width, routes, bus, onPointerEnter, onPointerLeave }: {
  station: Station
  x: number
  y: number
  width: number
  routes: Route[] | undefined
  bus: boolean // on a bus route's map: include the station's buses
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const now = useNow()
  const path = `/stations/${encodeURIComponent(station.mbtaStopId)}/predictions${bus ? '?bus=true' : ''}`
  const what = bus || !station.routeId ? 'Bus' : 'Train'
  const predictions = usePolling(() => api<Prediction[]>(path), path, REFRESH_MS)
  const groups = predictions.data ? groupDepartures(predictions.data, now, 2) : []

  return (
    <MarkerCard id="station-preview" x={x} y={y} width={width} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <p className="font-semibold">{station.name}</p>
      {predictions.error ? (
        <p className="text-neutral-500">{what} times aren't available right now.</p>
      ) : !predictions.data ? (
        <p className="text-neutral-500">Loading {what.toLowerCase()} times…</p>
      ) : groups.length === 0 ? (
        <p className="text-neutral-500">{what === 'Bus' ? 'No buses are predicted here right now.' : noTrainsMessage(false, now)}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={`${g.routeId}|${g.directionId}`} className="flex items-start gap-2">
              <LineBadge routeId={g.routeId} routes={routes} />
              {/* Times under the destination, so a long one ("Ashmont/Braintree") never runs into them. */}
              <div className="min-w-0 flex-1">
                <p>to {routes?.find((r) => r.id === g.routeId)?.directionDestinations[g.directionId] ?? '…'}</p>
                <p className="font-semibold tabular-nums">{g.departures.map((d) => countdown(d, now)).join(', ')}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-neutral-500">Select the {station.routeId ? 'station' : 'stop'} for all departures.</p>
    </MarkerCard>
  )
}

// How far one wheel notch zooms. MapKit speeds zoom up for fast wheel events, and the per-frame glide looks fast to it,
// so this scales the distance down. Tuned so a mouse notch is about a quarter zoom step, as before the glide.
const WHEEL_SPEED = 0.25

// The parts of a wheel event MapKit reads, to re-send it.
const pick = ({ deltaX, deltaY, deltaMode, clientX, clientY, screenX, screenY, shiftKey, altKey, metaKey }: WheelEvent) => ({
  deltaX, deltaY, deltaMode, clientX, clientY, screenX, screenY, shiftKey, altKey, metaKey,
})

const CROWDING: Record<NonNullable<Car['crowding']>, { label: string; color: string; fill: number }> = {
  MANY_SEATS_AVAILABLE: { label: 'Many seats', color: 'bg-green-600', fill: 25 },
  FEW_SEATS_AVAILABLE: { label: 'Few seats', color: 'bg-amber-500', fill: 50 },
  STANDING_ROOM_ONLY: { label: 'Standing room only', color: 'bg-orange-600', fill: 75 },
  CRUSHED_STANDING_ROOM_ONLY: { label: 'Very crowded', color: 'bg-red-600', fill: 90 },
  FULL: { label: 'Full', color: 'bg-red-700', fill: 100 },
}
const CROWDING_ORDER = Object.keys(CROWDING)

/**
 * A train's card: where it's going, where it is, its cars, and how full each is when MBTA reports it (today Orange
 * and the newer Red Line cars). The summary is the most common level among the cars, the busier one on a tie.
 */
function TrainPreview({ vehicle, at, routes, onPointerEnter, onPointerLeave }: {
  vehicle: Vehicle
  at: CardAt
  routes: Route[] | undefined
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const route = findRoute(routes, vehicle.routeId)
  const bus = route?.type === 'bus' // a bus reports crowding for the whole bus: one level, no cars
  const { title, subtitle } = trainCallout(vehicle, route)
  const reported = vehicle.cars.flatMap((c) => c.crowding ?? [])
  const counts = new Map(reported.map((c) => [c, reported.filter((x) => x === c).length]))
  const typical = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || CROWDING_ORDER.indexOf(b) - CROWDING_ORDER.indexOf(a))[0]

  return (
    <MarkerCard id="train-preview" {...at} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden>
          <LineBadge routeId={vehicle.routeId} routes={routes} />
        </span>
        {title}
      </p>
      {subtitle && <p className="text-neutral-600 dark:text-neutral-300">{subtitle}</p>}
      {typical && bus ? (
        <p>
          <span className="font-semibold">{CROWDING[typical].label}</span>
          <span className="text-neutral-500"> · crowding from MBTA</span>
        </p>
      ) : typical ? (
        <div className="space-y-1.5">
          <p>
            <span className="font-semibold">{CROWDING[typical].label}</span>
            <span className="text-neutral-500"> · {vehicle.cars.length} cars</span>
          </p>
          {/* One bar per car, front first, sized and colored by MBTA's crowding level. (Its percentages read low even
              when seats are scarce, e.g. 11% for "few seats", so they'd draw as slivers; screen readers get them.) */}
          <ol className="flex h-7 items-end gap-1" aria-label="Crowding by car, front to back">
            {vehicle.cars.map((car, i) => {
              const level = car.crowding && CROWDING[car.crowding]
              return (
                <li key={i} className="relative h-full flex-1 overflow-hidden rounded-sm bg-neutral-200 dark:bg-neutral-700">
                  {level && <span className={`absolute inset-x-0 bottom-0 ${level.color}`} style={{ height: `${level.fill}%` }} />}
                  <span className="sr-only">
                    Car {i + 1}: {level ? `${level.label}${car.percentFull !== null ? `, ${car.percentFull}% full` : ''}` : 'not reported'}
                  </span>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-neutral-500">Front car first. Crowding from MBTA.</p>
        </div>
      ) : (
        !bus && vehicle.cars.length > 0 && <p className="text-neutral-500">{vehicle.cars.length} cars</p>
      )}
    </MarkerCard>
  )
}
