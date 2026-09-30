import { describe, expect, it } from 'vitest'
import { MAX_SNAP_METERS, trackSnapper, type Track } from './snap'

const LAT = 42.35
const M_PER_DEG_LON = 111_320 * Math.cos((LAT * Math.PI) / 180)
const eastOf = (lon: number, meters: number) => lon + meters / M_PER_DEG_LON

// A straight track running due north through 42.30..42.40 at -71.10.
const north: Track = { routeId: 'Red', points: [[42.3, -71.1], [42.35, -71.1], [42.4, -71.1]] }
const station = (mbtaStopId: string, name: string, latitude: number, longitude = -71.1) => ({ mbtaStopId, name, latitude, longitude })
const stations = [
  station('ahead-north', 'North Stop', 42.38),
  station('behind-south', 'South Stop', 42.32),
  station('here', 'Here', 42.35),
  station('north-end', 'Alewife', 42.4),
  station('south-end', 'Braintree', 42.3),
  station('other-branch', 'Ashmont', 42.3, -71.05), // ~4 km east, on no track here
]
const train = (over: Partial<Parameters<ReturnType<typeof trackSnapper>>[0]> = {}) => ({
  routeId: 'Red', latitude: LAT, longitude: eastOf(-71.1, 20), bearing: 0 as number | null,
  currentStatus: 'IN_TRANSIT_TO' as 'IN_TRANSIT_TO' | 'STOPPED_AT', stationId: null as string | null, destination: null as string | null, ...over,
})

describe('trackSnapper', () => {
  const place = trackSnapper([north], stations)

  it('moves a train a few meters off the line onto it', () => {
    const p = place(train())
    expect(p.longitude).toBeCloseTo(-71.1, 6)
    expect(p.latitude).toBeCloseTo(LAT, 6)
  })

  it('points along the track toward the next stop, even when the compass bearing disagrees', () => {
    expect(place(train({ stationId: 'ahead-north', bearing: 180 })).heading).toBeCloseTo(0)
    expect(place(train({ stationId: 'behind-south', bearing: 0 })).heading).toBeCloseTo(180)
  })

  it('uses the compass bearing, lined up with the track, when stopped at the station or the stop is unknown', () => {
    expect(place(train({ currentStatus: 'STOPPED_AT', stationId: 'here', bearing: 170 })).heading).toBeCloseTo(180)
    expect(place(train({ bearing: 20 })).heading).toBeCloseTo(0) // a little off the track's heading
    expect(place(train({ bearing: 100 })).heading).toBeCloseTo(180) // more than 90° off: the other way
    expect(place(train({ bearing: 350 })).heading).toBeCloseTo(0) // wraps around north
  })

  it('points toward the destination first, even stopped with a stale bearing and a next stop behind', () => {
    expect(place(train({ destination: 'Alewife', currentStatus: 'STOPPED_AT', stationId: 'here', bearing: 180 })).heading).toBeCloseTo(0)
    expect(place(train({ destination: 'Alewife', stationId: 'behind-south', bearing: 180 })).heading).toBeCloseTo(0)
    expect(place(train({ destination: 'Braintree', bearing: 0 })).heading).toBeCloseTo(180)
  })

  it('reads "Ashmont/Braintree" as either branch end, using the one on this track', () => {
    expect(place(train({ destination: 'Ashmont/Braintree', bearing: 0 })).heading).toBeCloseTo(180)
  })

  it('falls back to the next stop when the destination is on another branch or unknown, or the train is there', () => {
    expect(place(train({ destination: 'Ashmont', stationId: 'ahead-north', bearing: 180 })).heading).toBeCloseTo(0)
    expect(place(train({ destination: 'Nowhere', stationId: 'behind-south', bearing: 0 })).heading).toBeCloseTo(180)
    const atAlewife = train({ latitude: 42.4, destination: 'Alewife', currentStatus: 'STOPPED_AT', stationId: 'north-end', bearing: 180 })
    expect(place(atAlewife).heading).toBeCloseTo(180) // at its destination: only the bearing is left
  })

  it('has no arrow when neither the next stop nor a bearing says which way', () => {
    expect(place(train({ bearing: null })).heading).toBeNull()
  })

  it('leaves a train far from its line (e.g. in a yard) at its GPS position and bearing', () => {
    const far = train({ longitude: eastOf(-71.1, MAX_SNAP_METERS + 50), bearing: 37 })
    expect(place(far)).toEqual({ latitude: far.latitude, longitude: far.longitude, heading: 37 })
  })

  it("only snaps to the train's own route", () => {
    const orange = train({ routeId: 'Orange', bearing: 12 })
    expect(place(orange)).toEqual({ latitude: orange.latitude, longitude: orange.longitude, heading: 12 })
  })

  it("works when the track's points run the other way (south)", () => {
    const southward = trackSnapper([{ routeId: 'Red', points: [...north.points].reverse() }], stations)
    expect(southward(train({ stationId: 'ahead-north', bearing: null })).heading).toBeCloseTo(0)
    expect(southward(train({ stationId: 'behind-south', bearing: null })).heading).toBeCloseTo(180)
  })

  it('follows a diagonal track: 45° for a northeast track, in real meters', () => {
    const d = 0.01
    const northeast: Track = { routeId: 'Red', points: [[LAT, -71.1], [LAT + d, eastOf(-71.1, d * 111_320)]] }
    const p = trackSnapper([northeast], stations)(train({ latitude: LAT + d / 2, longitude: eastOf(-71.1, d * 111_320 / 2), bearing: 50 }))
    expect(p.heading).toBeCloseTo(45, 0)
  })

  it('picks the nearest of a route’s tracks (e.g. the Red Line’s two branches)', () => {
    const branch: Track = { routeId: 'Red', points: [[42.3, -71.09], [42.4, -71.09]] } // ~820 m east
    const p = trackSnapper([north, branch], stations)(train({ longitude: eastOf(-71.09, -15) }))
    expect(p.longitude).toBeCloseTo(-71.09, 6)
  })
})
