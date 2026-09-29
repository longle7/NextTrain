import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, getRoutes, getStations, type Route, type RouteShape, type Vehicle } from '../api'
import { Status } from '../components'
import { locationErrorMessage, nearestStations, OUT_OF_AREA_MILES } from '../geo'
import { decodePolyline } from '../polyline'
import { usePolling } from '../usePolling'

const REFRESH_MS = 10_000
const BOSTON: L.LatLngExpression = [42.355, -71.08]

// Popup/tooltip content as text, so names from the API are never parsed as HTML.
const text = (s: string) => Object.assign(document.createElement('div'), { innerText: s })

const STATUS = { INCOMING_AT: 'Arriving at', STOPPED_AT: 'Stopped at', IN_TRANSIT_TO: 'Next stop:' }

function describe(v: Vehicle, route: Route | undefined) {
  const where = v.stopName && v.currentStatus ? `\n${STATUS[v.currentStatus]} ${v.stopName}` : ''
  return `${route?.name ?? v.routeId} to ${route?.directionDestinations[v.directionId] ?? 'unknown'}${where}`
}

// A dot in the line's color with an arrow pointing the way the train is heading.
function trainIcon(color: string, bearing: number | null) {
  const arrow = bearing === null ? '' : '<path d="M12 3 L17 12 H7 Z" fill="white"/>'
  return L.divIcon({
    className: '',
    iconSize: [24, 24],
    html: `<svg viewBox="0 0 24 24" width="24" height="24" style="transform: rotate(${bearing ?? 0}deg)">
      <circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/>${arrow}</svg>`,
  })
}

export default function MapPage() {
  const navigate = useNavigate()
  const routes = usePolling(getRoutes, 'routes')
  const stations = usePolling(getStations, 'stations')
  const shapes = usePolling(() => api<RouteShape[]>('/routes/shapes'), 'shapes')
  const vehicles = usePolling(() => api<Vehicle[]>('/vehicles'), 'vehicles', REFRESH_MS)

  const container = useRef<HTMLDivElement>(null)
  const trains = useRef(new Map<string, L.Marker>())
  const me = useRef<L.CircleMarker>(undefined)
  const [map, setMap] = useState<L.Map>()
  const [locating, setLocating] = useState(false)
  const [locateMessage, setLocateMessage] = useState<string>()

  useEffect(() => {
    const m = L.map(container.current!).setView(BOSTON, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    // Stations draw above the lines (overlay pane, 400) and below trains (marker pane, 600); your dot above all.
    m.createPane('stations').style.zIndex = '450'
    m.createPane('me').style.zIndex = '650'
    setMap(m)
    const markers = trains.current
    return () => {
      m.remove()
      markers.clear()
      me.current = undefined
    }
  }, [])

  // Lines
  useEffect(() => {
    if (!map || !shapes.data) return
    const color = (id: string) => routes.data?.find((r) => r.id === id)?.color ?? 'gray'
    const layer = L.layerGroup(
      shapes.data.map((s) => L.polyline(decodePolyline(s.polyline), { color: color(s.routeId), weight: 5, opacity: 0.9 })),
    ).addTo(map)
    return () => void layer.remove()
  }, [map, shapes.data, routes.data])

  // Stations: tap to open departures
  useEffect(() => {
    if (!map || !stations.data) return
    const layer = L.layerGroup(
      stations.data.map((s) =>
        L.circleMarker([s.latitude, s.longitude], {
          pane: 'stations', radius: 6, color: '#222', weight: 2, fillColor: 'white', fillOpacity: 1,
        })
          .bindTooltip(text(s.name))
          .on('click', () => navigate(`/stations/${s.mbtaStopId}`)),
      ),
    ).addTo(map)
    return () => void layer.remove()
  }, [map, stations.data, navigate])

  // Trains: move existing markers instead of recreating them, so an open popup survives a refresh.
  useEffect(() => {
    if (!map || !vehicles.data) return
    const live = new Set<string>()
    for (const v of vehicles.data) {
      live.add(v.id)
      const route = routes.data?.find((r) => r.id === v.routeId)
      let marker = trains.current.get(v.id)
      if (!marker) {
        marker = L.marker([v.latitude, v.longitude]).bindPopup('').addTo(map)
        trains.current.set(v.id, marker)
      }
      marker
        .setLatLng([v.latitude, v.longitude])
        .setIcon(trainIcon(route?.color ?? 'gray', v.bearing))
        .setPopupContent(text(describe(v, route)))
    }
    for (const [id, marker] of trains.current) {
      if (!live.has(id)) {
        marker.remove()
        trains.current.delete(id)
      }
    }
  }, [map, vehicles.data, routes.data])

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
        const here = L.latLng(coords.latitude, coords.longitude)
        me.current ??= L.circleMarker(here, { pane: 'me', radius: 8, color: 'white', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map)
        me.current.setLatLng(here)
        map.flyTo(here, 15)
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
      <Status error={vehicles.error ?? shapes.error ?? stations.error} />
      {/* isolate keeps Leaflet's high z-indexes below the sticky header */}
      <div className="relative isolate">
        <div ref={container} className="h-[calc(100dvh-16rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 overflow-hidden rounded-xl shadow-sm" />
        <button
          onClick={locate}
          disabled={locating}
          aria-label="Show my location"
          className="absolute top-3 right-3 z-[1000] grid size-11 place-items-center rounded-full bg-white text-blue-600 shadow-md active:opacity-70 disabled:opacity-60 dark:bg-neutral-800 dark:text-blue-400"
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
