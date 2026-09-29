import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, getRoutes, getStations, type Route, type RouteShape, type Vehicle } from '../api'
import { Status } from '../components'
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
  const [map, setMap] = useState<L.Map>()

  useEffect(() => {
    const m = L.map(container.current!).setView(BOSTON, 12)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m)
    // Stations draw above the lines (overlay pane, 400) and below trains (marker pane, 600).
    m.createPane('stations').style.zIndex = '450'
    setMap(m)
    const markers = trains.current
    return () => {
      m.remove()
      markers.clear()
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

  return (
    <>
      <h1 className="text-2xl font-bold">Live map</h1>
      <Status error={vehicles.error ?? shapes.error ?? stations.error} />
      {/* isolate keeps Leaflet's high z-indexes below the sticky header */}
      <div ref={container} className="isolate h-[calc(100dvh-16rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 overflow-hidden rounded-xl shadow-sm" />
      <p className="text-center text-xs text-neutral-500">
        Trains update every 10 seconds; arrows show the direction of travel. Tap a train for where it's headed, or a station for departures.
      </p>
    </>
  )
}
