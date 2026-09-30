// Types for the parts of Apple's MapKit JS (https://developer.apple.com/documentation/mapkitjs) the map uses.
// MapKit JS isn't on npm; mapkit.ts loads it from Apple's CDN, which defines the global `mapkit`.

declare namespace mapkit {
  type Status = 'Initialized' | 'Refreshed' | 'Unauthorized' | 'Too Many Requests' | 'Bad Request' | 'Malformed Response'

  const FeatureVisibility: { readonly Adaptive: string; readonly Hidden: string; readonly Visible: string }

  function init(options: { authorizationCallback: (done: (token: string) => void) => void }): void
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
}
