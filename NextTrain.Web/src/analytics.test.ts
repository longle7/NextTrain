import { afterEach, describe, expect, it, vi } from 'vitest'

// analytics.ts reads VITE_GA_ID when it loads, so each test loads a fresh copy after setting it.
async function load(gaId: string | undefined, navigatorProps: Record<string, unknown> = {}) {
  vi.resetModules()
  vi.stubEnv('VITE_GA_ID', gaId ?? '')
  vi.stubGlobal('navigator', { ...navigatorProps })
  return import('./analytics')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('analyticsBlocked', () => {
  it('is unavailable without a measurement ID, or with one that is not a GA4 ID', async () => {
    expect((await load(undefined)).analyticsBlocked()).toBe('unavailable')
    expect((await load('UA-12345-1')).analyticsBlocked()).toBe('unavailable')
    expect((await load('G-<script>')).analyticsBlocked()).toBe('unavailable')
  })

  it('is allowed (pending consent) with a GA4 ID and no privacy signal', async () => {
    expect((await load('G-ABC123XYZ')).analyticsBlocked()).toBeUndefined()
  })

  it('honors Global Privacy Control and Do Not Track', async () => {
    expect((await load('G-ABC123XYZ', { globalPrivacyControl: true })).analyticsBlocked()).toBe('privacy-signal')
    expect((await load('G-ABC123XYZ', { doNotTrack: '1' })).analyticsBlocked()).toBe('privacy-signal')
    expect((await load('G-ABC123XYZ', { doNotTrack: '0', globalPrivacyControl: false })).analyticsBlocked()).toBeUndefined()
  })
})

describe('cleanPath', () => {
  it.each([
    ['/commutes/42', '/commutes/:id'],
    ['/commutes/42?from=home#top', '/commutes/:id'],
    ['/commutes/new', '/commutes/new'],
    ['/commutes/new?station=place-pktrm', '/commutes/new'],
    ['/stations/place-pktrm', '/stations/place-pktrm'],
    ['/map?line=Red', '/map'],
    ['/', '/'],
  ])('%s -> %s', async (path, expected) => {
    expect((await load('G-ABC123XYZ')).cleanPath(path)).toBe(expected)
  })
})

describe('without consent', () => {
  it('does nothing at startup, and tracking a page is a no-op', async () => {
    const analytics = await load('G-ABC123XYZ')
    analytics.startAnalyticsIfAllowed() // no stored choice (and no localStorage here): must not start
    expect(() => analytics.trackPageView('/lines')).not.toThrow()
    expect((globalThis as { dataLayer?: unknown }).dataLayer).toBeUndefined()
  })
})
