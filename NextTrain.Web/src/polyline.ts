/**
 * Decodes a Google encoded polyline (the format MBTA uses for route shapes) into [lat, lon] pairs.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = []
  let i = 0
  let lat = 0
  let lon = 0
  const next = () => {
    let result = 0
    let shift = 0
    let byte
    do {
      byte = encoded.charCodeAt(i++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }
  while (i < encoded.length) {
    lat += next()
    lon += next()
    points.push([lat / 1e5, lon / 1e5])
  }
  return points
}
