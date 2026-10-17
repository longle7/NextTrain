// Types for the parts of Apple's MapKit JS (https://developer.apple.com/documentation/mapkitjs) the map uses.
// MapKit JS isn't on npm; mapkit.ts loads it from Apple's CDN, which defines the global `mapkit`.

declare namespace mapkit {
  type Status = 'Initialized' | 'Refreshed' | 'Unauthorized' | 'Too Many Requests' | 'Bad Request' | 'Malformed Response'

  const FeatureVisibility: { readonly Adaptive: string; readonly Hidden: string; readonly Visible: string }

  function init(options: { authorizationCallback: (done: (token: string) => void) => void; libraries?: string[] }): void
  function addEventListener(type: 'configuration-change' | 'error', listener: (event: { status: Status }) => void): void
  // Libraries (https://developer.apple.com/documentation/mapkitjs/mapkit/load): load() starts loading them, then
  // MapKit fires load or load-error with their names. (Apple's docs say load() returns a promise; 5.81's doesn't.)
  function addEventListener(type: 'load' | 'load-error', listener: (event: { libraries: string[] }) => void): void
  function load(libraries: string[]): void
  const loadedLibraries: string[]

  class Coordinate {
    constructor(latitude: number, longitude: number)
    latitude: number
    longitude: number
  }
  class CoordinateSpan {
    constructor(latitudeDelta: number, longitudeDelta: number)
  }
  class CoordinateRegion {
    constructor(center: Coordinate, span: CoordinateSpan)
  }
  class BoundingRegion {
    constructor(northLatitude: number, eastLongitude: number, southLatitude: number, westLongitude: number)
    toCoordinateRegion(): CoordinateRegion
  }

  class Style {
    constructor(options: { strokeColor?: string; strokeOpacity?: number; lineWidth?: number; lineJoin?: string; lineCap?: string })
  }
  class Overlay {}
  class PolylineOverlay extends Overlay {
    constructor(points: Coordinate[], options?: { style?: Style })
  }

  interface AnnotationOptions {
    title?: string
    accessibilityLabel?: string
    calloutEnabled?: boolean
    displayPriority?: number
    anchorOffset?: DOMPoint
    size?: { width: number; height: number }
    enabled?: boolean
  }
  class Annotation {
    static readonly DisplayPriority: { Low: number; High: number; Required: number }
    constructor(coordinate: Coordinate, factory: (coordinate: Coordinate, options: AnnotationOptions) => Element, options?: AnnotationOptions)
    coordinate: Coordinate
    title: string
    subtitle: string
    accessibilityLabel: string
    element: Element
  }

  interface MapOptions {
    region?: CoordinateRegion
    colorScheme?: string
    showsCompass?: string
    showsScale?: string
    showsMapTypeControl?: boolean
    showsUserLocationControl?: boolean
    isRotationEnabled?: boolean
    pointOfInterestFilter?: PointOfInterestFilter
  }
  class PointOfInterestFilter {
    static readonly excludingAllCategories: PointOfInterestFilter
  }
  class Map {
    static readonly ColorSchemes: { Light: string; Dark: string }
    constructor(parent: HTMLElement, options?: MapOptions)
    colorScheme: string
    setRegionAnimated(region: CoordinateRegion, animate?: boolean): this
    region: CoordinateRegion & { span: { latitudeDelta: number } }
    addEventListener(type: 'region-change-start' | 'region-change-end', listener: () => void): void
    removeEventListener(type: 'region-change-start' | 'region-change-end', listener: () => void): void
    addOverlays(overlays: Overlay[]): Overlay[]
    removeOverlays(overlays: Overlay[]): Overlay[]
    addAnnotation(annotation: Annotation): Annotation
    addAnnotations(annotations: Annotation[]): Annotation[]
    removeAnnotation(annotation: Annotation): Annotation
    removeAnnotations(annotations: Annotation[]): Annotation[]
    destroy(): void
  }

  // Street-level imagery, from the look-around library (https://developer.apple.com/documentation/mapkitjs/lookaround).
  class LookAround {
    constructor(parent: HTMLElement, location: Coordinate)
    readonly element: HTMLDivElement
    readonly readyState: 'loading' | 'complete' | 'error' | 'destroyed'
    addEventListener(type: 'load', listener: () => void): void
    // detail.type 'availability-error': Apple has no imagery there.
    addEventListener(type: 'error', listener: (event: CustomEvent<{ type: string; message: string }>) => void): void
    destroy(): void
  }
}
