import { getMapKitToken, type Route, type Vehicle } from './api'

// Apple's MapKit JS, pinned to one version with Subresource Integrity: the browser refuses to run the script if
// Apple's file ever differs from the one this hash was made from, so a tampered CDN file can't run in our app.
// (MapKit then loads its own map renderer, mk-csr.js, from the same Apple CDN; Apple versions that one itself.)
// To upgrade, change the version and recompute the hash:
//   curl -s https://cdn.apple-mapkit.com/mk/<version>/mapkit.js | openssl dgst -sha384 -binary | openssl base64 -A
export const MAPKIT_URL = 'https://cdn.apple-mapkit.com/mk/5.81.65/mapkit.js'
export const MAPKIT_INTEGRITY = 'sha384-y+x9sMgF6hD1fKLnlCx36fwU/SXLFs15E+QI24jtU52FsKlrCWzYk+kN0mwhq4m3'

let ready: Promise<void> | undefined

/**
 * Loads MapKit JS once, then sets it up to get its tokens from our API. Resolves when MapKit accepted the first token.
 * A failed script load (e.g. offline) can be retried on the next call; a refused token can't (it won't fix itself).
 */
export function loadMapKit(): Promise<void> {
  ready ??= new Promise<void>((resolve, reject) => {
    const script = Object.assign(document.createElement('script'), {
      src: MAPKIT_URL,
      integrity: MAPKIT_INTEGRITY,
      crossOrigin: 'anonymous', // integrity checks need a CORS request (Apple's CDN allows it)
      async: true,
    })
    script.onload = () => {
      mapkit.addEventListener('configuration-change', (event) => event.status === 'Initialized' && resolve())
      mapkit.addEventListener('error', (event) => reject(new Error(`MapKit: ${event.status}`)))
      mapkit.init({ authorizationCallback: (done) => void getMapKitToken().then(done, reject) })
    }
    script.onerror = () => {
      script.remove()
      ready = undefined
      reject(new Error('MapKit failed to load'))
    }
    document.head.append(script)
  })
  return ready
}

const STATUS = { INCOMING_AT: 'Arriving at', STOPPED_AT: 'Stopped at', IN_TRANSIT_TO: 'Next stop:' }

/** A train's callout: "Red Line to Alewife", then where it is ("Next stop: Park Street") when MBTA says. */
export function trainCallout(v: Vehicle, route: Route | undefined) {
  return {
    title: `${route?.name ?? v.routeId} to ${route?.directionDestinations[v.directionId] ?? 'unknown'}`,
    subtitle: v.stopName && v.currentStatus ? `${STATUS[v.currentStatus]} ${v.stopName}` : '',
  }
}

// Map markers are built with DOM calls, never HTML strings, so a name or color from the API can't inject markup.
const SVG = 'http://www.w3.org/2000/svg'
const svgElement = (tag: string, attributes: Record<string, string>) => {
  const element = document.createElementNS(SVG, tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  return element
}

/**
 * A dot in the line's color with a white arrowhead pointing the way the train is heading (no arrow if unknown).
 * The arrowhead is notched, like a navigation arrow: a plain triangle looks the same turned by 120°, so its
 * direction can't be read.
 */
export function trainElement(color: string, heading: number | null) {
  const svg = svgElement('svg', { viewBox: '0 0 24 24', width: '24', height: '24' })
  svg.append(svgElement('circle', { cx: '12', cy: '12', r: '10', stroke: 'white', 'stroke-width': '2' }))
  svg.append(svgElement('path', { d: 'M12 4.5 L17 17 L12 14 L7 17 Z', fill: 'white', 'stroke-linejoin': 'round' }))
  updateTrainElement(svg, color, heading)
  return svg
}

// heading: degrees clockwise from north.
export function updateTrainElement(svg: Element, color: string, heading: number | null) {
  const [circle, arrow] = svg.children as unknown as [SVGElement, SVGElement]
  circle.style.fill = color // a style property, so an invalid value is just ignored
  arrow.style.display = heading === null ? 'none' : ''
  ;(svg as SVGElement).style.transform = `rotate(${heading ?? 0}deg)`
}

/**
 * A station's dot, as its own button. We handle the tap here rather than through MapKit's selection: where dots
 * overlap, MapKit sometimes picks the one underneath, but the browser always delivers the tap to the dot on top.
 */
export function stationElement(name: string, open: () => void) {
  const dot = Object.assign(document.createElement('div'), { className: 'station-dot', title: name, tabIndex: 0 })
  dot.setAttribute('role', 'button')
  dot.setAttribute('aria-label', `${name} station`)
  dot.addEventListener('click', open)
  dot.addEventListener('keydown', (event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), open()))
  return dot
}

export const userElement = () => Object.assign(document.createElement('div'), { className: 'user-dot' })
