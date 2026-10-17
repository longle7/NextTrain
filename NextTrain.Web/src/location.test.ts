import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The iPhone app: location goes through Capacitor's plugin (iOS's own permission), never the web view's.
const plugin = vi.hoisted(() => ({
  getCurrentPosition: vi.fn(),
  checkPermissions: vi.fn(),
}))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('@capacitor/geolocation', () => ({ Geolocation: plugin }))

const { currentPosition, locationAllowed, locationRemembered } = await import('./geo')

describe('location in the iPhone app', () => {
  beforeEach(() => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetAllMocks()
  })

  it('finds you through the plugin and remembers that location works', async () => {
    plugin.getCurrentPosition.mockResolvedValue({ coords: { latitude: 42.3564, longitude: -71.0624, accuracy: 10 } })

    expect(await currentPosition()).toEqual({ latitude: 42.3564, longitude: -71.0624 })
    expect(locationRemembered()).toBe(true)
  })

  it('turns a refusal into the web error Home already explains, and forgets', async () => {
    plugin.getCurrentPosition.mockResolvedValue({ coords: { latitude: 42.3564, longitude: -71.0624 } })
    await currentPosition()
    plugin.getCurrentPosition.mockRejectedValue(new Error('Location permission was denied'))
    plugin.checkPermissions.mockResolvedValue({ location: 'denied' })

    await expect(currentPosition()).rejects.toMatchObject({ code: 1, PERMISSION_DENIED: 1 })
    expect(locationRemembered()).toBe(false)
  })

  it('is allowed when iOS says so, and only then', async () => {
    plugin.checkPermissions.mockResolvedValue({ location: 'granted' })
    expect(await locationAllowed()).toBe(true)
    plugin.checkPermissions.mockResolvedValue({ location: 'prompt' })
    expect(await locationAllowed()).toBe(false)
  })
})
