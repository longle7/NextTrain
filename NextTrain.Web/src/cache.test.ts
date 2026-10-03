import { expect, it } from 'vitest'
import { keysToEvict } from './cache'

it('keysToEvict drops the oldest entries beyond the limit, and nothing at or under it', () => {
  const entries: [string, number][] = [['b', 20], ['a', 10], ['d', 40], ['c', 30]]
  expect(keysToEvict(entries, 2)).toEqual(['a', 'b'])
  expect(keysToEvict(entries, 4)).toEqual([])
  expect(keysToEvict(entries, 10)).toEqual([])
})
