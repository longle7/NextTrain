import { expect, it } from 'vitest'
import { withRecent } from './recent'

it('withRecent moves the station to the front, drops duplicates, and keeps three', () => {
  expect(withRecent([], 'a')).toEqual(['a'])
  expect(withRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
  expect(withRecent(['a', 'b', 'c'], 'd')).toEqual(['d', 'a', 'b'])
})
