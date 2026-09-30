// Types for the parts of Apple's MapKit JS (https://developer.apple.com/documentation/mapkitjs) the map uses.
// MapKit JS isn't on npm; mapkit.ts loads it from Apple's CDN, which defines the global `mapkit`.

declare namespace mapkit {
  type Status = 'Initialized' | 'Refreshed' | 'Unauthorized' | 'Too Many Requests' | 'Bad Request' | 'Malformed Response'

  const FeatureVisibility: { readonly Adaptive: string; readonly Hidden: string; readonly Visible: string }

  function init(options: { authorizationCallback: (done: (token: string) => void) => void; language?: string }): void
  function addEventListener(type: 'configuration-change' | 'error', listener: (event: { status: Status }) => void): void

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
  class Padding {
    constructor(top: number, right: number, bottom: number, left: number)
  }

  class Style {
    constructor(options: { strokeColor?: string; strokeOpacity?: number; lineWidth?: number; lineJoin?: string; lineCap?: string })
  }
  class Overlay {}
  class PolylineOverlay extends Overlay {
    constructor(points: Coordinate[], options?: { style?: Style; enabled?: boolean })
  }

  interface AnnotationOptions {
    title?: string
    subtitle?: string
    accessibilityLabel?: string
    calloutEnabled?: boolean
    displayPriority?: number
    collisionMode?: string
    anchorOffset?: DOMPoint
    size?: { width: number; height: number }
    enabled?: boolean
  }
  class Annotation {
    static readonly DisplayPriority: { Low: number; High: number; Required: number }
    static readonly CollisionMode: { Rectangle: string; Circle: string; None: string }
    constructor(coordinate: Coordinate, factory: (coordinate: Coordinate, options: AnnotationOptions) => Element, options?: AnnotationOptions)
    coordinate: Coordinate
    title: string
    subtitle: string
    accessibilityLabel: string
    selected: boolean
    element: Element
    addEventListener(type: 'select' | 'deselect', listener: () => void): void
  }

  interface MapOptions {
    region?: CoordinateRegion
    colorScheme?: string
    showsCompass?: string
    showsScale?: string
    showsMapTypeControl?: boolean
    showsZoomControl?: boolean
    showsUserLocationControl?: boolean
    isRotationEnabled?: boolean
    pointOfInterestFilter?: PointOfInterestFilter
    padding?: Padding
  }
  class PointOfInterestFilter {
    static readonly excludingAllCategories: PointOfInterestFilter
  }
  class Map {
    static readonly ColorSchemes: { Light: string; Dark: string }
    constructor(parent: HTMLElement, options?: MapOptions)
    colorScheme: string
    region: CoordinateRegion
    annotations: Annotation[]
    overlays: Overlay[]
    setRegionAnimated(region: CoordinateRegion, animate?: boolean): this
    addEventListener(type: 'region-change-start', listener: () => void): void
    removeEventListener(type: 'region-change-start', listener: () => void): void
    addOverlays(overlays: Overlay[]): Overlay[]
    removeOverlays(overlays: Overlay[]): Overlay[]
    addAnnotation(annotation: Annotation): Annotation
    addAnnotations(annotations: Annotation[]): Annotation[]
    removeAnnotation(annotation: Annotation): Annotation
    removeAnnotations(annotations: Annotation[]): Annotation[]
    destroy(): void
  }
}
