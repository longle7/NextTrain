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

/** Shows and hides the station's next-trains card (MapPage's StationPreview). */
export interface Preview {
  show: (dot: HTMLElement) => void
  hide: (now?: boolean) => void
}

// Every station dot's actions, to hand a tap or hover to the nearest dot (see stationElement).
const stationActions = new WeakMap<Element, { open: () => void; preview: Preview }>()
let hovered: Element | undefined

// The station dot whose visible center is closest to a pointer, among those whose tap area it's in.
function nearestDot(x: number, y: number, fallback: HTMLElement): HTMLElement {
  let best = fallback
  let bestDistance = Infinity
  for (const dot of document.querySelectorAll<HTMLElement>('.station-dot')) {
    const r = dot.getBoundingClientRect()
    const distance = Math.hypot(r.x + r.width / 2 - x, r.y + r.height / 2 - y)
    if (distance <= r.width / 2 && distance < bestDistance) [best, bestDistance] = [dot, distance]
  }
  return best
}

/**
 * A station's dot, as its own button. We handle the tap here rather than through MapKit's selection: where dots
 * overlap, MapKit sometimes picks the one underneath.
 *
 * The dot looks 12 px but its tap area is 24 px (WCAG 2.2 target size). Downtown, dots sit closer than that, so
 * tap areas overlap; a tap or hover goes to the station whose visible dot is nearest the pointer, never to a
 * neighbor's invisible edge. Hovering with a mouse, or focusing with the keyboard, shows its next trains; Escape
 * hides them.
 */
export function stationElement(name: string, open: () => void, preview: Preview) {
  const dot = Object.assign(document.createElement('div'), { className: 'station-dot', tabIndex: 0 })
  dot.setAttribute('role', 'button')
  dot.setAttribute('aria-label', `${name} station`)
  dot.setAttribute('aria-describedby', 'station-preview')
  stationActions.set(dot, { open, preview })
  const nearest = (event: PointerEvent | MouseEvent) => {
    const target = nearestDot(event.clientX, event.clientY, dot)
    return { target, actions: stationActions.get(target) ?? { open, preview } }
  }

  // detail 0 is a click from the keyboard or a script, with no pointer position: this dot, as is.
  dot.addEventListener('click', (event) => (event.detail === 0 ? open() : nearest(event).actions.open()))
  dot.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
    if (event.key === 'Escape') preview.hide(true)
  })
  // Mouse only: on a touchscreen a tap opens the station, and a hover card would just flash first.
  const hover = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    const { target, actions } = nearest(event)
    if (target === hovered) return
    hovered = target
    actions.preview.show(target as HTMLElement)
  }
  dot.addEventListener('pointerenter', hover)
  dot.addEventListener('pointermove', hover)
  dot.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'mouse') return
    hovered = undefined
    preview.hide()
  })
  dot.addEventListener('focus', () => preview.show(dot))
  dot.addEventListener('blur', () => preview.hide())
  return dot
}

export const userElement = () => Object.assign(document.createElement('div'), { className: 'user-dot' })
