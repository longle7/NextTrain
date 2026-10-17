import { describe, expect, it } from 'vitest'
import type { Station } from './api'
import { changeOptions } from './changes'

const stop = (mbtaStopId: string, latitude: number, longitude: number, busRoutes: string, routeId = ''): Station => ({
  mbtaStopId, name: mbtaStopId, latitude, longitude, routeId, busRoutes, averageWeekdayBoardings: null, isAccessible: null,
})

// MBTA's real stops: the 66 toward Nubian at Tremont St @ Columbus Ave, the 22 about 80 m away at Columbus Ave @
// Malcolm X Blvd, and the 22 again about 410 m away at Columbus Ave @ Cedar St.
const tremontAtColumbus = stop('1323', 42.331479, -71.095333, '66:1')
const columbusAtMalcolmX = stop('1222', 42.331191, -71.094468, '22:1')
const columbusAtCedar = stop('1221', 42.328012, -71.096921, '22:1')
const roxburyCrossing = stop('place-rcmnl', 42.331397, -71.095451, '', 'Orange') // across Tremont St

describe('changeOptions', () => {
  it('offers the 22 a short walk from the 66, not one more than 5 minutes away', () => {
    const options = changeOptions([tremontAtColumbus], [tremontAtColumbus, columbusAtMalcolmX, columbusAtCedar], '66')

    expect(options.get('22')).toEqual([{ off: tremontAtColumbus, on: columbusAtMalcolmX, walk: 1 }])
    expect(options.has('66')).toBe(false) // the ride's own route isn't a change
  })

  it('offers a T line at a station across the street, and a route at the same stop with no walk', () => {
    const shared = stop('1323', 42.331479, -71.095333, '66:1,15:0') // the 15 stops there too
    const options = changeOptions([shared], [shared, roxburyCrossing], '66')

    expect(options.get('15')).toEqual([{ off: shared, on: shared, walk: 0 }])
    expect(options.get('Orange')?.map((p) => [p.on.mbtaStopId, p.walk])).toEqual([['place-rcmnl', 1]])
  })

  it('lists each place once, by its shortest walk, in riding order', () => {
    const farOff = stop('far', 42.33300, -71.09500, '66:1') // ~170 m north of Malcolm X Blvd
    const options = changeOptions([farOff, tremontAtColumbus], [farOff, tremontAtColumbus, columbusAtMalcolmX], '66')

    expect(options.get('22')).toEqual([{ off: tremontAtColumbus, on: columbusAtMalcolmX, walk: 1 }])
  })
})
