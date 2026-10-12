import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { API_URL } from './api'

// Error reports (the Privacy Policy's "Error reports"): when NextTrain hits an error, it sends what went wrong, the
// page it happened on (the path only), the app version, and the platform. Never your ID, location, or searches.
// Production builds only, and at most 5 a session, so an error in a loop can't flood anything.
const MAX_REPORTS = 5
let reports = 0
let version: Promise<string | undefined> | undefined

export function reportError(error: unknown) {
  const e = error instanceof Error ? error : new Error(String(error))
  // "Script error." is all a browser reveals about another site's script (e.g. Apple's map): nothing to act on.
  if (!import.meta.env.PROD || reports >= MAX_REPORTS || e.message === 'Script error.') return
  reports++
  const native = Capacitor.isNativePlatform()
  version ??= native ? App.getInfo().then((info) => `${info.version} (${info.build})`, () => undefined) : Promise.resolve(undefined)
  void version
    .then((v) =>
      // A plain request, not api(): it must not carry the X-User-Id that api() adds.
      fetch(`${API_URL}/client-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: (e.message || 'Unknown error').slice(0, 500),
          stack: e.stack?.slice(0, 4000),
          page: location.pathname.slice(0, 200),
          version: v,
          platform: native ? 'ios' : 'web',
        }),
        keepalive: true, // still sent if the page is closing
      }),
    )
    .catch(() => {}) // reporting an error must never cause another
}

/** Reports uncaught errors and rejected promises. (The error boundary reports the crashes it catches itself.) */
export function startErrorReports() {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message))
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason))
}
