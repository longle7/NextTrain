import { expect, it, vi } from 'vitest'
import { reportError } from './errors'

it('reports errors from production builds only, at most 5 a session, with the page path and never a user ID', async () => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response(null, { status: 204 })))
  vi.stubGlobal('fetch', fetch)
  vi.stubGlobal('location', { pathname: '/stations/place-pktrm' })

  reportError(new Error('in development')) // a dev build: nothing sent
  vi.stubEnv('PROD', true)
  reportError('Script error.') // another site's script: nothing to act on
  for (let i = 0; i < 7; i++) reportError(new TypeError(`boom ${i}`))

  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(5))
  const [url, init] = fetch.mock.calls[0]
  expect(url).toMatch(/\/client-errors$/)
  expect(init.headers).toEqual({ 'Content-Type': 'application/json' }) // no X-User-Id
  expect(JSON.parse(init.body as string)).toMatchObject({ message: 'boom 0', page: '/stations/place-pktrm', platform: 'web' })

  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
