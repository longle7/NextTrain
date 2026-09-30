import { expect, it } from 'vitest'
import type { Route, Vehicle } from './api'
import { MAPKIT_INTEGRITY, MAPKIT_URL, trainCallout } from './mapkit'

const red: Route = {
  id: 'Red', name: 'Red Line', color: '#DA291C', textColor: '#FFFFFF', directionNames: ['South', 'North'],
  directionDestinations: ['Ashmont/Braintree', 'Alewife'],
}
const train = (v: Partial<Vehicle>): Vehicle => ({
  id: 'R-1', routeId: 'Red', directionId: 1, latitude: 42.36, longitude: -71.06, bearing: 90,
  currentStatus: null, stopName: null, stationId: null, ...v,
})

it('titles a train by line and destination, with where it is as the subtitle', () => {
  expect(trainCallout(train({ currentStatus: 'IN_TRANSIT_TO', stopName: 'Park Street' }), red)).toEqual({
    title: 'Red Line to Alewife',
    subtitle: 'Next stop: Park Street',
  })
  expect(trainCallout(train({ currentStatus: 'STOPPED_AT', stopName: 'Harvard' }), red).subtitle).toBe('Stopped at Harvard')
})

it('leaves the subtitle empty without a stop, and falls back to the route ID before routes load', () => {
  expect(trainCallout(train({}), undefined)).toEqual({ title: 'Red to unknown', subtitle: '' })
})

it('pins MapKit to an exact https version with a SHA-384 integrity hash', () => {
  expect(MAPKIT_URL).toMatch(/^https:\/\/cdn\.apple-mapkit\.com\/mk\/\d+\.\d+\.\d+\/mapkit\.js$/) // no "5.x.x"
  expect(MAPKIT_INTEGRITY).toMatch(/^sha384-[A-Za-z0-9+/]{64}$/)
})
