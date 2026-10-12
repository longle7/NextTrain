import { describe, expect, it, vi } from 'vitest'
import { forget, keysToEvict, remember, remembered } from './cache'

it('keysToEvict drops the oldest entries beyond the limit, and nothing at or under it', () => {
  const entries: [string, number][] = [['b', 20], ['a', 10], ['d', 40], ['c', 30]]
  expect(keysToEvict(entries, 2)).toEqual(['a', 'b'])
  expect(keysToEvict(entries, 4)).toEqual([])
  expect(keysToEvict(entries, 10)).toEqual([])
})

describe('forget', () => {
  it('drops just that answer', () => {
    // The tests run without a browser: a minimal localStorage.
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    })
    remember('commutes', [1])
    remember('alerts', [2])
    forget('commutes')
    expect([remembered('commutes'), remembered<number[]>('alerts')?.data]).toEqual([undefined, [2]])
    vi.unstubAllGlobals()
  })
})
