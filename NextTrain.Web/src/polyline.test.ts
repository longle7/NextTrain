import { expect, it } from 'vitest'
import { decodePolyline } from './polyline'

it('decodes the example from Google’s polyline docs', () => {
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ])
})
