import { describe, expect, it } from 'vitest'
import type { Route, Station, Vehicle } from './api'
import { directionsDown, trainsByStation } from './lineTrains'

const station = (id: string, name: string): Station => ({
  mbtaStopId: id, name, latitude: 0, longitude: 0, routeId: 'Red', averageWeekdayBoardings: null, isAccessible: null,
})

// Red Line in line order, trimmed: Alewife at the top, both southern branches at the bottom.
const red = [
  station('place-alfcl', 'Alewife'),
  station('place-harsq', 'Harvard'),
  station('place-pktrm', 'Park Street'),
  station('place-asmnl', 'Ashmont'),
  station('place-brntn', 'Braintree'),
]
const redLine: Route = {
  id: 'Red', name: 'Red Line', color: '#DA291C', textColor: '#FFFFFF',
  directionNames: ['South', 'North'], directionDestinations: ['Ashmont/Braintree', 'Alewife'], type: 'subway', shortName: '',
}

const vehicle = (id: string, directionId: number, currentStatus: Vehicle['currentStatus'], stationId: string | null, stopName: string | null, routeId = 'Red'): Vehicle => ({
  id, routeId, directionId, currentStatus, stationId, stopName, latitude: 0, longitude: 0, bearing: null, cars: [],
})

describe('directionsDown', () => {
  it('compares where the two destinations sit, including branch pairs', () => {
    expect(directionsDown(red, ['Ashmont/Braintree', 'Alewife'])).toEqual([true, false])
  })

  it('matches a station whose own name has a slash (the E branch ends at "Medford/Tufts")', () => {
    const e = [station('place-hsmnl', 'Heath Street'), station('place-lech', 'Lechmere'), station('place-mdftf', 'Medford/Tufts')]
    expect(directionsDown(e, ['Heath Street', 'Medford/Tufts'])).toEqual([false, true])
  })

  it('falls back to which half of the list the one known end is in', () => {
    expect(directionsDown(red, ['Somewhere New', 'Alewife'])).toEqual([true, false])
  })
})

describe('trainsByStation', () => {
  it('groups the route’s trains by station, with direction, stopped vs approaching, and a spoken label', () => {
    const trains = trainsByStation(
      [
        vehicle('R-1', 0, 'STOPPED_AT', 'place-harsq', 'Harvard'),
        vehicle('R-2', 1, 'IN_TRANSIT_TO', 'place-harsq', 'Harvard'),
        vehicle('R-3', 1, 'INCOMING_AT', 'place-pktrm', 'Park Street'),
        vehicle('O-1', 0, 'STOPPED_AT', 'place-harsq', 'Harvard', 'Orange'), // another line
        vehicle('R-4', 0, 'IN_TRANSIT_TO', null, null), // between trips, no stop
      ],
      redLine,
      red,
    )

    expect([...trains.keys()]).toEqual(['place-harsq', 'place-pktrm'])
    expect(trains.get('place-harsq')).toEqual([
      { id: 'R-1', down: true, atStation: true, label: 'Train to Ashmont/Braintree, stopped at Harvard' },
      { id: 'R-2', down: false, atStation: false, label: 'Train to Alewife, approaching Harvard' },
    ])
  })
})
