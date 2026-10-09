import { expect, it } from 'vitest'
import type { Commute, Route } from './api'
import { liveActivityDetails } from './liveActivity'

const commute: Commute = {
  id: 7, mbtaStopId: 'place-pktrm', stationName: 'Park Street', routeId: 'Red', directionId: 1,
  windowStart: '07:45:00', windowEnd: '08:15:00', activeDays: 'Mon,Tue,Wed,Thu,Fri',
}
const red: Route = {
  id: 'Red', name: 'Red Line', color: '#DA291C', textColor: '#FFFFFF',
  directionNames: ['South', 'North'], directionDestinations: ['Ashmont/Braintree', 'Alewife'], type: 'subway', shortName: '',
}

it('sends the Live Activity the commute, its line, the next trains, and the worst alert, with times in Unix seconds', () => {
  const details = liveActivityDetails(
    commute, red, ['2026-09-29T07:52:00-04:00', '2026-09-29T07:59:30-04:00'], new Date('2026-09-29T08:15:00-04:00'),
    { summary: 'Red Line delay' } as never,
  )
  expect(details).toEqual({
    commuteId: 7, stationName: 'Park Street', destination: 'Alewife', lineName: 'RL',
    lineColor: '#DA291C', lineTextColor: '#FFFFFF',
    endsAt: Date.parse('2026-09-29T08:15:00-04:00') / 1000,
    departures: [Date.parse('2026-09-29T07:52:00-04:00') / 1000, Date.parse('2026-09-29T07:59:30-04:00') / 1000],
    alert: 'Red Line delay',
  })
})

it('labels Green Line branches like the app does', () => {
  expect(liveActivityDetails({ ...commute, routeId: 'Green-B' }, undefined, [], new Date(0), undefined).lineName).toBe('GL B')
})
