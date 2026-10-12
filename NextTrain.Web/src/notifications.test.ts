import { beforeEach, expect, it, vi } from 'vitest'

const push = vi.hoisted(() => ({
  permission: 'prompt' as string,
  token: (() => {}) as (token: { value: string }) => void,
}))
const api = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<unknown>>(() => Promise.resolve()))

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('./api', () => ({ api }))
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: async () => ({ receive: push.permission }),
    checkPermissions: async () => ({ receive: push.permission }),
    addListener: async (_: string, listener: (token: { value: string }) => void) => {
      push.token = listener
    },
    register: async () => push.token({ value: 'ab12' }), // iOS answers with this phone's token
  },
}))

const { notificationChoice, refreshNotifications, turnOffNotifications, turnOnNotifications } = await import('./notifications')

// The tests run without a browser: a minimal localStorage.
const stored = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => stored.set(key, value),
  removeItem: (key: string) => stored.delete(key),
})

beforeEach(() => {
  stored.clear()
  api.mockClear()
})

it('turning on asks iOS, remembers the choice, and gives our API the token', async () => {
  push.permission = 'granted'

  expect(await turnOnNotifications()).toBe(true)

  expect(notificationChoice()).toBe('on')
  expect(api).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: '{"token":"ab12"}' })
})

it('when iOS says no, nothing is sent and nothing is remembered', async () => {
  push.permission = 'denied'

  expect(await turnOnNotifications()).toBe(false)

  expect(notificationChoice()).toBeNull()
  expect(api).not.toHaveBeenCalled()
})

it('turning off makes our API forget the token', async () => {
  await turnOffNotifications()

  expect(notificationChoice()).toBe('off')
  expect(api).toHaveBeenCalledWith('/me/push-token', { method: 'DELETE' })
})

it('at launch, sends the token again only when they are on', async () => {
  push.permission = 'granted'
  await refreshNotifications()
  expect(api).not.toHaveBeenCalled()

  localStorage.setItem('nexttrain.notifications', 'on')
  await refreshNotifications()
  expect(api).toHaveBeenCalledWith('/me/push-token', { method: 'PUT', body: '{"token":"ab12"}' })
})
